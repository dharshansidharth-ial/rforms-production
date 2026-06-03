class Form < ApplicationRecord
  after_initialize :set_json_defaults, if: :new_record?

  belongs_to :organization
  belongs_to :owner, class_name: "User"
  has_many :form_permissions, dependent: :destroy
  has_many :permitted_users, through: :form_permissions, source: :user
  has_many :form_responses, dependent: :destroy

  STATUSES = %w[draft published closed archived].freeze
  validates :title, presence: true
  validates :status, inclusion: { in: STATUSES }

  before_create :generate_public_token

  scope :published, -> { where(status: "published") }
  scope :active, -> { where(status: "published").where("expires_at IS NULL OR expires_at > ?", Time.current).where("opens_at IS NULL OR opens_at <= ?", Time.current) }

  def accepting_responses?
    return false unless status == "published"
    return false if expires_at.present? && expires_at < Time.current
    return false if opens_at.present? && opens_at > Time.current
    return false if response_cap.present? && form_responses.submitted.count >= response_cap
    true
  end

  def duplicate!(new_owner)
    new_form = dup
    new_form.title = "Copy of #{title}"
    new_form.status = "draft"
    new_form.public_token = nil
    new_form.owner = new_owner
    new_form.save!
    new_form
  end

  def quiz?
    is_quiz
  end

  private

  def set_json_defaults
    self.schema        ||= {}
    self.branding      ||= {}
    self.language_config ||= { "default" => "en", "enabled" => ["en"] }
    self.audience      ||= { "type" => "open" }
    self.quiz_config   ||= {}
  end

  def generate_public_token
    self.public_token = SecureRandom.urlsafe_base64(16)
  end
end
