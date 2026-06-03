module Api
  module V1
    class UsersController < ApplicationController
      before_action :set_user, only: [:show, :update, :destroy]

      def index
        authorize User
        users = policy_scope(User).order(:name).page(params[:page]).per(params[:per_page] || 50)
        render json: {
          users: users.map { |u| user_json(u) },
          meta: pagination_meta(users)
        }
      end

      def show
        authorize @user
        render json: { user: user_json(@user) }
      end

      def create
        authorize User
        user = current_user.organization.users.create!(user_create_params)
        AuditLog.record(actor: current_user, org: current_user.organization, event: "user_created", target: user, ip: request.remote_ip)
        render json: { user: user_json(user) }, status: :created
      end

      def update
        authorize @user
        @user.update!(user_update_params)
        AuditLog.record(actor: current_user, org: current_user.organization, event: "user_updated", target: @user, ip: request.remote_ip)
        render json: { user: user_json(@user) }
      end

      def destroy
        authorize @user
        @user.update!(status: "inactive")
        AuditLog.record(actor: current_user, org: current_user.organization, event: "user_deleted", target: @user, ip: request.remote_ip)
        head :no_content
      end

      private

      def set_user
        @user = current_user.organization.users.find(params[:id])
      end

      def user_create_params
        params.require(:user).permit(:email, :name, :password, :role, :department, :employee_id, :manager_id)
      end

      def user_update_params
        params.require(:user).permit(:name, :role, :department, :employee_id, :manager_id, :status, :mfa_enabled)
      end

      def user_json(u)
        {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          department: u.department,
          employee_id: u.employee_id,
          status: u.status,
          mfa_enabled: u.mfa_enabled,
          last_sign_in_at: u.last_sign_in_at,
          manager: u.manager ? { id: u.manager.id, name: u.manager.name } : nil
        }
      end

      def pagination_meta(collection)
        { current_page: collection.current_page, total_pages: collection.total_pages, total_count: collection.total_count }
      end
    end
  end
end
