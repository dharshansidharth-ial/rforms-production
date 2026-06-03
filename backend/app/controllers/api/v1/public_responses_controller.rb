module Api
  module V1
    class PublicResponsesController < ApplicationController
      skip_before_action :authenticate_user!

      before_action :set_form
      before_action :check_accepting

      # POST /api/v1/public/forms/:public_token/responses
      def create
        response_record = @form.form_responses.build(
          payload:        params[:payload] || {},
          hidden_fields:  params[:hidden_fields] || {},
          geo:            params[:geo],
          responder:      current_user_if_any,
          responder_email: current_user_if_any&.email || params[:email],
          is_draft:       params[:is_draft] == true || params[:is_draft] == "true",
          ip_address:     request.remote_ip,
          user_agent:     request.user_agent
        )
        response_record.save!

        if @form.quiz? && !response_record.is_draft
          answer_key = @form.quiz_config["answer_key"] || {}
          response_record.calculate_score!(answer_key)
        end

        render json: { response: response_json(response_record) }, status: :created
      end

      # PATCH /api/v1/public/forms/:public_token/responses/:id
      def update
        response_record = @form.form_responses.drafts.find(params[:id])
        response_record.update!(
          payload:       params[:payload] || response_record.payload,
          hidden_fields: params[:hidden_fields] || response_record.hidden_fields,
          is_draft:      params[:is_draft] != false && params[:is_draft] != "false"
        )
        render json: { response: response_json(response_record) }
      end

      private

      def set_form
        @form = Form.find_by!(public_token: params[:public_token])
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Form not found" }, status: :not_found
      end

      def check_accepting
        unless @form.accepting_responses?
          render json: { error: "This form is not accepting responses" }, status: :gone
        end
      end

      def current_user_if_any
        return nil unless request.headers["Authorization"]
        token   = request.headers["Authorization"].split(" ").last
        payload = JwtService.decode(token)
        User.find_by(id: payload[:user_id])
      rescue AuthenticationError, ActiveRecord::RecordNotFound
        nil
      end

      def response_json(r)
        {
          id:             r.id,
          form_id:        r.form_id,
          is_draft:       r.is_draft,
          score:          r.score,
          max_score:      r.max_score,
          submitted_at:   r.submitted_at
        }
      end
    end
  end
end
