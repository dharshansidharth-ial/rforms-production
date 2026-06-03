class AuditLogPolicy < ApplicationPolicy
  def index? = user.super_admin? || user.org_admin?

  class Scope < ApplicationPolicy::Scope
    def resolve = scope.where(organization_id: user.organization_id)
  end
end
