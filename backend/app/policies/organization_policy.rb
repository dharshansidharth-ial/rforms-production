class OrganizationPolicy < ApplicationPolicy
  def show?   = user.organization_id == record.id
  def update? = user.org_admin? || user.super_admin?

  class Scope < ApplicationPolicy::Scope
    def resolve = scope.where(id: user.organization_id)
  end
end
