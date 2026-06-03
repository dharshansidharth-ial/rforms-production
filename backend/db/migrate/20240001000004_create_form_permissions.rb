class CreateFormPermissions < ActiveRecord::Migration[8.1]
  def change
    create_table :form_permissions do |t|
      t.references :form, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :role, null: false, default: "viewer"
      t.timestamps
    end

    add_index :form_permissions, [:form_id, :user_id], unique: true
  end
end
