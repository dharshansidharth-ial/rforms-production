class FormResponse < ApplicationRecord
  after_initialize :set_json_defaults, if: :new_record?

  belongs_to :form
  belongs_to :responder, class_name: "User", optional: true

  STATUSES = %w[submitted under_review approved rejected].freeze
  validates :status, inclusion: { in: STATUSES }

  scope :submitted, -> { where(is_draft: false) }
  scope :drafts,    -> { where(is_draft: true) }

  before_save :set_submitted_at, if: -> { !is_draft && submitted_at.nil? }

  def calculate_score!(answer_key)
    return unless form.quiz?
    total = 0.0
    max   = 0.0
    answer_key.each do |question_name, config|
      max += config["points"].to_f
      answer = payload[question_name]
      total += config["points"].to_f if answer.to_s == config["correct"].to_s
    end
    update!(score: total, max_score: max)
  end

  private

  def set_json_defaults
    self.payload       ||= {}
    self.hidden_fields ||= {}
  end

  def set_submitted_at
    self.submitted_at = Time.current
  end
end
