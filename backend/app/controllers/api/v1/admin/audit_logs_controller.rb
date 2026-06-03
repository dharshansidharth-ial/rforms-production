module Api
  module V1
    module Admin
      class AuditLogsController < ApplicationController
        def index
          authorize :audit_log, :index?
          logs = current_user.organization.audit_logs
                             .includes(:actor)
                             .order(created_at: :desc)
                             .page(params[:page]).per(params[:per_page] || 50)

          logs = logs.where(event: params[:event]) if params[:event].present?
          logs = logs.where(actor_id: params[:actor_id]) if params[:actor_id].present?
          logs = logs.where("created_at >= ?", params[:from]) if params[:from].present?
          logs = logs.where("created_at <= ?", params[:to]) if params[:to].present?

          render json: {
            audit_logs: logs.map { |l| log_json(l) },
            meta: { current_page: logs.current_page, total_pages: logs.total_pages, total_count: logs.total_count }
          }
        end

        private

        def log_json(l)
          {
            id: l.id,
            event: l.event,
            actor: l.actor ? { id: l.actor.id, name: l.actor.name, email: l.actor.email } : nil,
            target_type: l.target_type,
            target_id: l.target_id,
            metadata: l.metadata,
            ip_address: l.ip_address,
            created_at: l.created_at
          }
        end
      end
    end
  end
end
