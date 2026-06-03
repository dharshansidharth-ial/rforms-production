class CreateAuditLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :audit_logs do |t|
      t.references :actor, foreign_key: { to_table: :users }
      t.references :organization, null: false, foreign_key: true
      t.string :event, null: false
      t.string :target_type
      t.bigint :target_id
      t.json :metadata
      t.string :ip_address
      t.timestamps
    end

    add_index :audit_logs, [:organization_id, :created_at]
    add_index :audit_logs, :event
    add_index :audit_logs, [:target_type, :target_id]
  end
end
