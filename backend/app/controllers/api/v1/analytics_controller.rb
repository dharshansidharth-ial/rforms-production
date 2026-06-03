module Api
  module V1
    class AnalyticsController < ApplicationController
      def show
        form = Form.find(params[:form_id])
        authorize form, :show?

        responses = form.form_responses.submitted

        render json: {
          form_id: form.id,
          overview: {
            total_responses: responses.count,
            completion_rate: completion_rate(form),
            avg_duration_seconds: nil,
            today: responses.where("submitted_at >= ?", Date.current.beginning_of_day).count,
            this_week: responses.where("submitted_at >= ?", 7.days.ago).count
          },
          trend: daily_trend(responses),
          question_breakdown: question_breakdown(responses, form.schema),
          quiz: form.quiz? ? quiz_stats(responses) : nil
        }
      end

      def dashboard
        org = current_user.organization
        forms = policy_scope(Form)

        render json: {
          total_forms: forms.count,
          published_forms: forms.where(status: "published").count,
          total_responses: FormResponse.submitted.joins(:form).where(forms: { organization_id: org.id }).count,
          responses_this_week: FormResponse.submitted.joins(:form).where(forms: { organization_id: org.id }).where("form_responses.submitted_at >= ?", 7.days.ago).count,
          top_forms: top_forms_data(forms)
        }
      end

      private

      def completion_rate(form)
        total = form.form_responses.count
        return 0.0 if total.zero?
        ((form.form_responses.submitted.count.to_f / total) * 100).round(1)
      end

      def daily_trend(responses)
        responses.where("submitted_at >= ?", 30.days.ago)
                 .group("DATE(submitted_at)")
                 .count
                 .map { |date, count| { date: date.to_s, count: count } }
      end

      def question_breakdown(responses, schema)
        return [] unless schema.is_a?(Hash)
        elements = schema["pages"]&.flat_map { |p| p["elements"] || [] } || []
        elements.filter_map do |el|
          name = el["name"]
          next unless name
          choices = question_choices(responses, name)
          { question: el["title"] || name, name: name, type: el["type"], choices: choices }
        end
      end

      def question_choices(responses, question_name)
        tallies = Hash.new(0)
        responses.each { |r| tallies[r.payload[question_name].to_s] += 1 }
        tallies.sort_by { |_, v| -v }.first(10).map { |k, v| { value: k, count: v } }
      end

      def quiz_stats(responses)
        scored = responses.where.not(score: nil)
        return {} if scored.empty?
        scores = scored.pluck(:score)
        {
          avg_score: scores.sum / scores.size,
          max_possible: responses.first&.max_score,
          score_distribution: score_buckets(scores)
        }
      end

      def score_buckets(scores)
        max = scores.max.to_f
        return [] if max.zero?
        buckets = Array.new(5, 0)
        scores.each { |s| buckets[[(s / max * 4).floor, 4].min] += 1 }
        buckets.each_with_index.map { |c, i| { range: "#{i * 20}-#{(i + 1) * 20}%", count: c } }
      end

      def top_forms_data(forms)
        forms.order(updated_at: :desc).limit(5).map do |f|
          { id: f.id, title: f.title, response_count: f.form_responses.submitted.count, status: f.status }
        end
      end
    end
  end
end
