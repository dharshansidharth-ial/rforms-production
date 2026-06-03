module Api
  module V1
    class AuthController < ApplicationController
      skip_before_action :authenticate_user!, only: [:login, :register]

      def login
        user = User.find_by!(email: params[:email].to_s.downcase)
        unless user.authenticate(params[:password])
          return render json: { error: "Invalid credentials" }, status: :unauthorized
        end
        unless user.status == "active"
          return render json: { error: "Account is #{user.status}" }, status: :forbidden
        end

        user.update!(last_sign_in_at: Time.current)
        AuditLog.record(actor: user, org: user.organization, event: "login", ip: request.remote_ip)

        render json: {
          token: JwtService.issue_for(user),
          user: user_payload(user)
        }
      end

      def register
        org = Organization.find_by!(domain: extract_domain(params[:email]))
        user = org.users.create!(
          email: params[:email].to_s.downcase,
          name: params[:name],
          password: params[:password],
          role: "form_owner"
        )
        AuditLog.record(actor: user, org: org, event: "user_created", ip: request.remote_ip)
        render json: { token: JwtService.issue_for(user), user: user_payload(user) }, status: :created
      end

      def logout
        current_user.invalidate_jwt!
        AuditLog.record(actor: current_user, org: current_user.organization, event: "logout", ip: request.remote_ip)
        head :no_content
      end

      def me
        render json: { user: user_payload(current_user) }
      end

      private

      def user_payload(user)
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
          organization: {
            id: user.organization.id,
            name: user.organization.name,
            branding: user.organization.branding
          }
        }
      end

      def extract_domain(email)
        email.to_s.split("@").last
      end
    end
  end
end
