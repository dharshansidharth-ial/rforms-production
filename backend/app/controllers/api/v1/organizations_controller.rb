module Api
  module V1
    class OrganizationsController < ApplicationController
      def show
        authorize current_user.organization
        render json: { organization: org_json(current_user.organization) }
      end

      def update
        authorize current_user.organization
        current_user.organization.update!(org_params)
        AuditLog.record(actor: current_user, org: current_user.organization, event: "org_settings_updated", ip: request.remote_ip)
        render json: { organization: org_json(current_user.organization) }
      end

      private

      def org_params
        params.require(:organization).permit(
          :name, :logo_url, :header_image_url, :primary_color, :accent_color, :font,
          :default_language, :mfa_required, :sheets_capture_enabled,
          enabled_languages: []
        )
      end

      def org_json(org)
        {
          id: org.id,
          name: org.name,
          domain: org.domain,
          branding: org.branding,
          default_language: org.default_language,
          enabled_languages: org.enabled_languages,
          mfa_required: org.mfa_required,
          sheets_capture_enabled: org.sheets_capture_enabled,
          user_count: org.users.count
        }
      end
    end
  end
end
