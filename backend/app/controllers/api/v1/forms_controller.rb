module Api
  module V1
    class FormsController < ApplicationController
      before_action :set_form, only: [:show, :update, :destroy, :publish, :copy, :responses_summary]

      def index
        forms = policy_scope(Form).order(updated_at: :desc).page(params[:page]).per(params[:per_page] || 20)
        render json: {
          forms: forms.map { |f| form_json(f) },
          meta: pagination_meta(forms)
        }
      end

      def show
        authorize @form
        render json: { form: form_json(@form, full: true) }
      end

      def create
        authorize Form
        form = current_user.organization.forms.build(form_params)
        form.owner = current_user
        form.save!
        AuditLog.record(actor: current_user, org: current_user.organization, event: "form_created", target: form, ip: request.remote_ip)
        render json: { form: form_json(form, full: true) }, status: :created
      end

      def update
        authorize @form
        @form.update!(form_params)
        AuditLog.record(actor: current_user, org: current_user.organization, event: "form_updated", target: @form, ip: request.remote_ip)
        render json: { form: form_json(@form, full: true) }
      end

      def destroy
        authorize @form
        @form.destroy!
        AuditLog.record(actor: current_user, org: current_user.organization, event: "form_deleted", target: @form, ip: request.remote_ip)
        head :no_content
      end

      def publish
        authorize @form, :update?
        @form.update!(status: "published")
        AuditLog.record(actor: current_user, org: current_user.organization, event: "form_published", target: @form, ip: request.remote_ip)
        render json: { form: form_json(@form, full: true) }
      end

      def copy
        authorize @form, :show?
        new_form = @form.duplicate!(current_user)
        AuditLog.record(actor: current_user, org: current_user.organization, event: "form_copied", target: new_form, metadata: { source_id: @form.id }, ip: request.remote_ip)
        render json: { form: form_json(new_form, full: true) }, status: :created
      end

      def responses_summary
        authorize @form, :show?
        responses = @form.form_responses.submitted
        render json: {
          total: responses.count,
          today: responses.where("submitted_at >= ?", Date.current.beginning_of_day).count,
          completion_rate: compute_completion_rate(@form)
        }
      end

      private

      def set_form
        @form = Form.find(params[:id])
      end

      def form_params
        params.require(:form).permit(
          :title, :description, :status, :require_login, :restrict_domains,
          :captcha_enabled, :allow_multiple_submissions, :single_response,
          :response_cap, :opens_at, :expires_at, :show_progress_bar,
          :confirmation_message, :redirect_url, :is_quiz, :sheets_capture_enabled,
          :sheets_url,
          schema: {}, branding: {}, language_config: {}, audience: {}, quiz_config: {}
        )
      end

      def form_json(form, full: false)
        data = {
          id: form.id,
          title: form.title,
          description: form.description,
          status: form.status,
          public_token: form.public_token,
          owner: { id: form.owner_id, name: form.owner.name },
          response_count: form.form_responses.submitted.count,
          is_quiz: form.is_quiz,
          created_at: form.created_at,
          updated_at: form.updated_at
        }
        if full
          data.merge!(
            schema: form.schema,
            branding: form.branding,
            language_config: form.language_config,
            audience: form.audience,
            quiz_config: form.quiz_config,
            settings: {
              require_login: form.require_login,
              single_response: form.single_response,
              response_cap: form.response_cap,
              opens_at: form.opens_at,
              expires_at: form.expires_at,
              show_progress_bar: form.show_progress_bar,
              confirmation_message: form.confirmation_message,
              redirect_url: form.redirect_url,
              captcha_enabled: form.captcha_enabled,
              sheets_capture_enabled: form.sheets_capture_enabled,
              sheets_url: form.sheets_url
            }
          )
        end
        data
      end

      def compute_completion_rate(form)
        total = form.form_responses.count
        return 0 if total.zero?
        submitted = form.form_responses.submitted.count
        ((submitted.to_f / total) * 100).round(1)
      end

      def pagination_meta(collection)
        {
          current_page: collection.current_page,
          total_pages: collection.total_pages,
          total_count: collection.total_count,
          per_page: collection.limit_value
        }
      end
    end
  end
end
