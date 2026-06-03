class ApplicationController < ActionController::API
  include Pundit::Authorization

  before_action :authenticate_user!

  rescue_from Pundit::NotAuthorizedError, with: :forbidden
  rescue_from AuthenticationError, with: :unauthorized
  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from ActiveRecord::RecordInvalid do |e|
    render json: { error: e.message, details: e.record&.errors&.full_messages }, status: :unprocessable_entity
  end

  attr_reader :current_user

  private

  def authenticate_user!
    token = extract_token
    payload = JwtService.decode(token)
    user = User.find(payload[:user_id])
    raise AuthenticationError, "Session revoked" if user.jti != payload[:jti]
    raise AuthenticationError, "Account inactive" unless user.status == "active"
    @current_user = user
  end

  def extract_token
    header = request.headers["Authorization"]
    raise AuthenticationError, "No token provided" unless header
    header.split(" ").last
  end

  def forbidden
    render json: { error: "Forbidden" }, status: :forbidden
  end

  def unauthorized(e)
    render json: { error: e.message }, status: :unauthorized
  end

  def not_found
    render json: { error: "Not found" }, status: :not_found
  end

  def pundit_user
    current_user
  end
end
