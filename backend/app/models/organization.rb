class Organization < ApplicationRecord
  after_initialize :set_json_defaults, if: :new_record?

  has_many :users, dependent: :destroy
  has_many :forms, dependent: :destroy
  has_many :templates, dependent: :destroy
  has_many :audit_logs, dependent: :destroy

  validates :name, presence: true
  validates :domain, uniqueness: true, allow_blank: true

  STATUSES = %w[active suspended].freeze
  validates :status, inclusion: { in: STATUSES }

  private

  def set_json_defaults
    self.enabled_languages ||= ["en"]
  end

  public

  def branding
    {
      logo_url: logo_url,
      header_image_url: header_image_url,
      primary_color: primary_color || "#1a73e8",
      accent_color: accent_color || "#fbbc04",
      font: font || "Inter"
    }
  end
end
