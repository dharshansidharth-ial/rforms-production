class FormPermission < ApplicationRecord
  belongs_to :form
  belongs_to :user

  ROLES = %w[editor viewer approver analyst].freeze
  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :form_id }
end
