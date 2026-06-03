class FormPolicy < ApplicationPolicy
  def index?   = true
  def show?    = owner_or_permitted? || admin?
  def create?  = user.can_create_forms?
  def update?  = owner_or_editor? || admin?
  def destroy? = owner? || admin?
  def view_responses? = owner_or_permitted? || admin?

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user.super_admin? || user.org_admin?
        scope.where(organization_id: user.organization_id)
      else
        owned  = scope.where(owner_id: user.id)
        shared = scope.joins(:form_permissions).where(form_permissions: { user_id: user.id })
        scope.where(id: owned.select(:id).or(shared.select(:id)))
      end
    end
  end

  private

  def owner?             = record.owner_id == user.id
  def admin?             = user.super_admin? || user.org_admin?
  def permitted_role     = record.form_permissions.find_by(user_id: user.id)&.role
  def owner_or_permitted?= owner? || permitted_role.present?
  def owner_or_editor?   = owner? || permitted_role == "editor" || admin?
end
