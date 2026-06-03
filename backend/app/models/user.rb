class User < ApplicationRecord
  has_secure_password

  belongs_to :organization
  belongs_to :manager, class_name: "User", optional: true
  has_many :subordinates, class_name: "User", foreign_key: :manager_id
  has_many :owned_forms, class_name: "Form", foreign_key: :owner_id, dependent: :destroy
  has_many :form_permissions, dependent: :destroy
  has_many :permitted_forms, through: :form_permissions, source: :form
  has_many :form_responses, foreign_key: :responder_id, dependent: :destroy
  has_many :audit_logs, foreign_key: :actor_id

  ROLES = %w[super_admin org_admin form_owner editor viewer approver analyst responder].freeze
  validates :role, inclusion: { in: ROLES }
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :email, uniqueness: { scope: :organization_id }
  validates :name, presence: true
  validates :status, inclusion: { in: %w[active inactive suspended] }

  before_create :generate_jti

  def super_admin? = role == "super_admin"
  def org_admin?   = role == "org_admin"
  def form_owner?  = role == "form_owner"
  def editor?      = role == "editor"
  def viewer?      = role == "viewer"
  def approver?    = role == "approver"
  def analyst?     = role == "analyst"
  def responder?   = role == "responder"

  def can_create_forms?
    %w[super_admin org_admin form_owner].include?(role)
  end

  def invalidate_jwt!
    update!(jti: SecureRandom.uuid)
  end

  private

  def generate_jti
    self.jti = SecureRandom.uuid
  end
end
