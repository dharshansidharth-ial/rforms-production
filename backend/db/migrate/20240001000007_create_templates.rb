class CreateTemplates < ActiveRecord::Migration[8.1]
  def change
    create_table :templates do |t|
      t.references :organization, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users }
      t.string :name, null: false
      t.text :description
      t.string :category
      t.json :schema
      t.boolean :is_global, default: false
      t.string :thumbnail_url
      t.timestamps
    end

    add_index :templates, :is_global
    add_index :templates, :category
  end
end
