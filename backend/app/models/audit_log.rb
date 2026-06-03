class AuditLog < ApplicationRecord
  after_initialize :set_json_defaults, if: :new_record?

  belongs_to :actor, class_name: "User", optional: true
  belongs_to :organization

  EVENTS = %w[
    user_created user_updated user_deleted
    form_created form_updated form_published form_deleted form_copied
    response_submitted response_approved response_rejected
    org_settings_updated
    export_downloaded
    login logout
  ].freeze

  validates :event, presence: true

  private

  def set_json_defaults
    self.metadata ||= {}
  end

  public

  def self.record(actor:, org:, event:, target: nil, metadata: {}, ip: nil)
    create!(
      actor: actor,
      organization: org,
      event: event,
      target_type: target&.class&.name,
      target_id: target&.id,
      metadata: metadata,
      ip_address: ip
    )
  end
end
