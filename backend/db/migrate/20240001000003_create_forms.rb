class CreateForms < ActiveRecord::Migration[8.1]
  def change
    create_table :forms do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.string :title, null: false
      t.text :description
      t.json :schema
      t.string :status, default: "draft"
      t.json :branding
      t.json :language_config
      t.json :audience
      t.json :quiz_config
      t.boolean :is_quiz, default: false
      t.boolean :require_login, default: false
      t.string :restrict_domains
      t.boolean :captcha_enabled, default: false
      t.boolean :allow_multiple_submissions, default: true
      t.boolean :single_response, default: false
      t.integer :response_cap
      t.datetime :opens_at
      t.datetime :expires_at
      t.boolean :show_progress_bar, default: true
      t.text :confirmation_message
      t.string :redirect_url
      t.boolean :sheets_capture_enabled, default: false
      t.string :sheets_url
      t.string :public_token
      t.timestamps
    end

    # t.references above already adds indexes on organization_id and owner_id
    add_index :forms, :status
    add_index :forms, :public_token, unique: true
  end
end
