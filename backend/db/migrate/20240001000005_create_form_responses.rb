class CreateFormResponses < ActiveRecord::Migration[8.1]
  def change
    create_table :form_responses do |t|
      t.references :form, null: false, foreign_key: true
      t.references :responder, foreign_key: { to_table: :users }
      t.string :responder_email
      t.json :payload
      t.json :hidden_fields
      t.json :geo
      t.string :status, default: "submitted"
      t.boolean :is_draft, default: false
      t.float :score
      t.float :max_score
      t.string :ip_address
      t.string :user_agent
      t.string :source_token
      t.datetime :submitted_at
      t.timestamps
    end

    # t.references already indexes form_id and responder_id
    add_index :form_responses, :status
    add_index :form_responses, :is_draft
    add_index :form_responses, :submitted_at
  end
end
