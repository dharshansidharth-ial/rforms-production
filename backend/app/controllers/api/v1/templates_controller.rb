module Api
  module V1
    class TemplatesController < ApplicationController
      def index
        templates = Template.for_org(current_user.organization_id).order(:category, :name)
        render json: { templates: templates.map { |t| template_json(t) } }
      end

      def show
        template = Template.for_org(current_user.organization_id).find(params[:id])
        render json: { template: template_json(template, full: true) }
      end

      def create_form_from_template
        template = Template.for_org(current_user.organization_id).find(params[:id])
        form = current_user.organization.forms.create!(
          owner: current_user,
          title: template.name,
          description: template.description,
          schema: template.schema
        )
        render json: { form_id: form.id }, status: :created
      end

      private

      def template_json(t, full: false)
        data = { id: t.id, name: t.name, description: t.description, category: t.category, thumbnail_url: t.thumbnail_url }
        data[:schema] = t.schema if full
        data
      end
    end
  end
end
