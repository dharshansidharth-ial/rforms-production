module Api
  module V1
    class ResponsesController < ApplicationController
      skip_before_action :authenticate_user!, only: [:create, :public_form]

      before_action :set_form
      before_action :check_form_access, only: [:create]

      def index
        authorize @form, :view_responses?
        responses = @form.form_responses.submitted
                         .order(submitted_at: :desc)
                         .page(params[:page]).per(params[:per_page] || 50)

        render json: {
          responses: responses.map { |r| response_json(r) },
          meta: pagination_meta(responses)
        }
      end

      def create
        response_record = @form.form_responses.build(
          payload: params[:payload] || {},
          hidden_fields: params[:hidden_fields] || {},
          geo: params[:geo],
          responder: current_user,
          responder_email: current_user&.email || params[:email],
          is_draft: params[:is_draft] == true || params[:is_draft] == "true",
          ip_address: request.remote_ip,
          user_agent: request.user_agent,
          source_token: params[:source_token]
        )

        response_record.save!

        if @form.quiz? && !response_record.is_draft
          answer_key = @form.quiz_config["answer_key"] || {}
          response_record.calculate_score!(answer_key)
        end

        if !response_record.is_draft
          AuditLog.record(actor: current_user, org: @form.organization, event: "response_submitted", target: response_record, ip: request.remote_ip)
        end

        render json: {
          response: response_json(response_record),
          score: response_record.score,
          max_score: response_record.max_score
        }, status: :created
      end

      def update_draft
        draft = @form.form_responses.drafts.find(params[:id])
        draft.update!(payload: params[:payload] || {}, hidden_fields: params[:hidden_fields] || {})
        render json: { response: response_json(draft) }
      end

      def submit_draft
        draft = @form.form_responses.drafts.find(params[:id])
        draft.update!(is_draft: false)
        render json: { response: response_json(draft) }
      end

      def export
        authorize @form, :view_responses?
        responses = @form.form_responses.submitted

        respond_to do |format|
          format.csv do
            csv_data = CsvExportService.export(responses, @form.schema)
            send_data csv_data, filename: "responses_#{@form.id}.csv", type: "text/csv"
          end
        end

        AuditLog.record(actor: current_user, org: @form.organization, event: "export_downloaded", target: @form, ip: request.remote_ip)
      end

      private

      def set_form
        @form = if params[:form_id].present?
          Form.find(params[:form_id])
        elsif params[:public_token].present?
          Form.find_by!(public_token: params[:public_token])
        end
      end

      def check_form_access
        return render json: { error: "Form not accepting responses" }, status: :unprocessable_entity unless @form.accepting_responses?
        if @form.require_login
          authenticate_user!
          return render json: { error: "Login required" }, status: :unauthorized unless current_user
        end
      end

      def response_json(r)
        {
          id: r.id,
          form_id: r.form_id,
          payload: r.payload,
          status: r.status,
          is_draft: r.is_draft,
          score: r.score,
          max_score: r.max_score,
          responder_email: r.responder_email,
          submitted_at: r.submitted_at,
          created_at: r.created_at
        }
      end

      def pagination_meta(collection)
        {
          current_page: collection.current_page,
          total_pages: collection.total_pages,
          total_count: collection.total_count
        }
      end
    end
  end
end
