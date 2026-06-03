class UserPolicy < ApplicationPolicy
  def index?   = admin?
  def show?    = admin? || record.id == user.id
  def create?  = admin?
  def update?  = admin? || record.id == user.id
  def destroy? = user.super_admin? || user.org_admin?

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.where(organization_id: user.organization_id)
    end
  end

  private

  def admin? = user.super_admin? || user.org_admin?
end
