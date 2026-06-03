module Api
  module V1
    class PublicFormsController < ApplicationController
      skip_before_action :authenticate_user!

      def show
        form = Form.find_by!(public_token: params[:public_token])
        unless form.accepting_responses?
          return render json: { error: "This form is not accepting responses" }, status: :gone
        end

        render json: {
          form: {
            id: form.id,
            title: form.title,
            description: form.description,
            schema: form.schema,
            branding: form_branding(form),
            settings: {
              show_progress_bar: form.show_progress_bar,
              confirmation_message: form.confirmation_message,
              redirect_url: form.redirect_url,
              require_login: form.require_login,
              single_response: form.single_response
            }
          }
        }
      end

      private

      def form_branding(form)
        org_branding = form.organization.branding
        form_branding = form.branding || {}
        org_branding.merge(form_branding.transform_keys(&:to_sym))
      end
    end
  end
end
