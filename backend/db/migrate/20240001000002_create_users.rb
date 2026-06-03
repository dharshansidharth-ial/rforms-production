class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.references :organization, null: false, foreign_key: true
      t.references :manager, foreign_key: { to_table: :users }
      t.string :email, null: false
      t.string :name, null: false
      t.string :password_digest, null: false
      t.string :role, null: false, default: "form_owner"
      t.string :department
      t.string :employee_id
      t.string :status, default: "active"
      t.boolean :mfa_enabled, default: false
      t.string :mfa_secret
      t.string :mfa_method, default: "totp"
      t.string :avatar_url
      t.datetime :last_sign_in_at
      t.string :jti
      t.timestamps
    end

    add_index :users, [:organization_id, :email], unique: true
    add_index :users, :email
    add_index :users, :jti
  end
end
