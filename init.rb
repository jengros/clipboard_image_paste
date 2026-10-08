#*******************************************************************************
# clipboard_image_paste Redmine plugin.
#
# Authors:
# - Richard Pecl & others (see README)
#
# Terms of use:
# - GNU GENERAL PUBLIC LICENSE Version 2
#*******************************************************************************

require 'redmine'

Redmine::Plugin.register :clipboard_image_paste do
  name        'Clipboard image paste'
  author      'Richard Pecl'
  description 'Paste cropped clipboard images as attachments using the Redmine 7 upload API'
  url         'http://www.redmine.org/plugins/clipboard_image_paste'
  version     '2.0.0'
  requires_redmine :version_or_higher => '7.0.2'
end

# Redmine's PluginLoader already runs this initializer inside Rails to_prepare.
# Keep the view hook in a Zeitwerk-compatible namespace; no model/controller patches.
ClipboardImagePaste::Hooks
