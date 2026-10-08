# frozen_string_literal: true
# Executed only in a disposable read-only Redmine image; no production volumes.
require 'json'
require 'base64'
require 'tmpdir'
require 'fileutils'
require 'logger'
require 'securerandom'
require 'digest'

def check(label)
  raise "FAIL: #{label}" unless yield
  puts "PASS: #{label}"
end

ENV['RAILS_ENV'] = 'production'
ENV['RAILS_RELATIVE_URL_ROOT'] = '/redmine'
ENV['SECRET_KEY_BASE'] = SecureRandom.hex(64)
$cbp_db_attempts = 0
module ClipboardVerificationNoDatabase
  def new_connection(*)
    $cbp_db_attempts += 1
    raise 'Database access prohibited in clipboard verification'
  end
end

Dir.mktmpdir('cbp-verification-') do |root|
  plugins_dir = File.join(root, 'plugins')
  plugin_dir = File.join(plugins_dir, 'clipboard_image_paste')
  FileUtils.mkdir_p(plugin_dir)
  $cbp_payload.each do |path, content|
    raise 'Invalid payload path' if path.start_with?('/') || path.split('/').include?('..')
    target = File.join(plugin_dir, path)
    FileUtils.mkdir_p(File.dirname(target))
    File.binwrite(target, Base64.strict_decode64(content))
  end
  Dir.glob(File.join(plugin_dir, '**', '*.rb')).each do |path|
    RubyVM::InstructionSequence.compile_file(path)
  end
  check('Ruby syntax') { true }
  FileUtils.mkdir_p(File.join(root, 'config'))
  database = File.join(root, 'config', 'database.yml')
  File.write(database, "production:\n  adapter: mysql2\n  database: verification_only\n  host: 127.0.0.1\n")
  # The image selects adapter gems by reading Gemfile's adjacent database.yml.
  # Copy only public Gemfile/lock into tmpfs; no bundle install or production config.
  %w[Gemfile Gemfile.lock].each { |file| FileUtils.cp(file, File.join(root, file)) }
  ENV['BUNDLE_GEMFILE'] = File.join(root, 'Gemfile')
  ENV['BUNDLE_WITHOUT'] = 'development:test'
  require 'bundler/setup'
  require 'active_record'
  ActiveRecord::ConnectionAdapters::ConnectionPool.prepend(ClipboardVerificationNoDatabase)
  require File.expand_path('config/application')
  app = Rails.application
  app.config.paths['config/database'] = [database]
  app.config.redmine_plugins_directory = plugins_dir
  app.config.assets.redmine_detect_update = false
  app.config.logger = Logger.new(File::NULL)
  app.config.cache_store = :null_store
  app.initialize!
  check('Redmine 7.0.2 / Rails 8.1.4') do
    Redmine::VERSION.to_a.take(3) == [7, 0, 2] && Rails.version == '8.1.4'
  end
  check('production eager loading') { app.config.eager_load }
  check('plugin registration 2.0.0') { Redmine::Plugin.find(:clipboard_image_paste).version == '2.0.0' }
  check('no model or controller patch') do
    !Issue.ancestors.map(&:name).any? { |name| name.to_s.start_with?('ClipboardImagePaste') } &&
      !AttachmentsController.ancestors.map(&:name).any? { |name| name.to_s.start_with?('ClipboardImagePaste') }
  end
  check('single header and body hook') do
    [:view_layouts_base_html_head, :view_layouts_base_body_bottom].all? do |hook|
      Redmine::Hook.hook_listeners(hook).count { |listener| listener.is_a?(ClipboardImagePaste::Hooks) } == 1
    end
  end
  3.times { app.reloader.prepare! }
  check('repeated prepare keeps one hook') do
    Redmine::Hook.hook_listeners(:view_layouts_base_body_bottom).count { |l| l.is_a?(ClipboardImagePaste::Hooks) } == 1
  end
  check('Korean and English translations') do
    I18n.t(:cbp_txt_add_image, locale: :ko) == '클립보드 이미지 추가' &&
      I18n.t(:cbp_txt_add_image, locale: :en) == 'Add picture from clipboard'
  end
  controller = ApplicationController.new
  view = controller.view_context
  header = I18n.with_locale(:ko) { view.render(partial: 'clipboard_image_paste/headers') }
  body = I18n.with_locale(:ko) { view.render(partial: 'clipboard_image_paste/add_form') }
  check('actual ERB rendering / escaped data labels') do
    body.include?('data-add-label="클립보드 이미지 추가"') && !body.include?('<script')
  end
  check('actual hook rendering') do
    Redmine::Hook.call_hook(:view_layouts_base_body_bottom, hook_caller: view).join.include?('cbp_paste_dlg')
  end
  app.assets.processor.process
  manifest = JSON.parse(File.read(app.config.assets.manifest_path))
  wanted = %w[clipboard_image_paste.js jcrop-0.9.12-p1.js clipboard_image_paste.css jquery.Jcrop-0.9.12.min.css Jcrop.gif]
  plugin_keys = wanted.to_h do |name|
    key = manifest.keys.find { |k| k.end_with?("/clipboard_image_paste/#{name}") }
    raise "Missing asset #{name}" unless key
    [name, key]
  end
  check('Propshaft compiles all five plugin assets') { plugin_keys.size == 5 }
  assets = {}
  plugin_keys.each do |name, key|
    item = manifest.fetch(key)
    target = File.join(app.config.assets.output_path, item.fetch('digested_path'))
    bytes = File.binread(target)
    assets["#{Redmine::Utils.relative_url_root}/assets/#{item.fetch('digested_path')}"] = Base64.strict_encode64(bytes)
  end
  check('header references compiled plugin assets') do
    header.scan(/(?:src|href)="([^"]+)"/).flatten.all? { |url| assets.key?(url) }
  end
  %w[jquery-3.7.1-ui-1.13.3.js attachments.js].each do |name|
    assets["/core/#{name}"] = Base64.strict_encode64(File.binread("app/assets/javascripts/#{name}"))
  end
  check('no DB connection attempted') { $cbp_db_attempts.zero? }
  fixture = { header: header, body: body, assets: assets,
              runtime: { redmine: Redmine::VERSION.to_s, rails: Rails.version, ruby: RUBY_VERSION },
              source_sha256: $cbp_payload.transform_values { |s| Digest::SHA256.hexdigest(Base64.strict_decode64(s)) } }
  puts 'CBP_FIXTURE=' + Base64.strict_encode64(JSON.generate(fixture))
end
