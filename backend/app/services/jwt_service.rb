class JwtService
  ALGORITHM = "HS256"
  ACCESS_TOKEN_TTL  = 24.hours
  REFRESH_TOKEN_TTL = 30.days

  def self.encode(payload, ttl: ACCESS_TOKEN_TTL)
    payload = payload.merge(exp: (Time.current + ttl).to_i, iat: Time.current.to_i)
    JWT.encode(payload, secret, ALGORITHM)
  end

  def self.decode(token)
    decoded = JWT.decode(token, secret, true, { algorithm: ALGORITHM })
    HashWithIndifferentAccess.new(decoded.first)
  rescue JWT::ExpiredSignature
    raise AuthenticationError, "Token expired"
  rescue JWT::DecodeError
    raise AuthenticationError, "Invalid token"
  end

  def self.issue_for(user)
    encode({ user_id: user.id, org_id: user.organization_id, role: user.role, jti: user.jti })
  end

  def self.secret
    Rails.application.credentials.secret_key_base || ENV.fetch("SECRET_KEY_BASE")
  end
end
