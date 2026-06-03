class Template < ApplicationRecord
  belongs_to :organization, optional: true
  belongs_to :created_by, class_name: "User", optional: true

  validates :name, presence: true

  CATEGORIES = %w[hr sales support operations education event other].freeze

  scope :global, -> { where(is_global: true) }
  scope :for_org, ->(org_id) { where(organization_id: org_id).or(where(is_global: true)) }
end
