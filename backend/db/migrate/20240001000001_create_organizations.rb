class CreateOrganizations < ActiveRecord::Migration[8.1]
  def change
    create_table :organizations do |t|
      t.string :name, null: false
      t.string :domain
      t.string :logo_url
      t.string :header_image_url
      t.string :primary_color, default: "#1a73e8"
      t.string :accent_color, default: "#fbbc04"
      t.string :font, default: "Inter"
      t.string :default_language, default: "en"
      t.json :enabled_languages           # no inline default — set via model after_initialize
      t.boolean :mfa_required, default: false
      t.boolean :sheets_capture_enabled, default: false
      t.string :status, default: "active"
      t.timestamps
    end

    add_index :organizations, :domain, unique: true
  end
end
