require_relative "boot"

require "rails"
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"

Bundler.require(*Rails.groups)

module Backend
  class Application < Rails::Application
    config.load_defaults 8.1

    config.autoload_lib(ignore: %w[assets tasks])
    config.api_only = true

    config.active_job.queue_adapter = :sidekiq

    config.autoload_paths += [Rails.root.join("app/services")]
    config.autoload_paths += [Rails.root.join("app/policies")]
  end
end
