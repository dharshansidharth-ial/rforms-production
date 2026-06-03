require "csv"

class CsvExportService
  def self.export(responses, schema)
    questions = extract_questions(schema)
    headers   = ["Response ID", "Submitted At", "Respondent Email"] + questions.map { |q| q[:title] }

    CSV.generate(headers: true) do |csv|
      csv << headers
      responses.each do |r|
        row = [r.id, r.submitted_at&.iso8601, r.responder_email]
        questions.each { |q| row << r.payload[q[:name]].to_s }
        csv << row
      end
    end
  end

  def self.extract_questions(schema)
    return [] unless schema.is_a?(Hash)
    (schema["pages"] || []).flat_map { |p| p["elements"] || [] }
                           .map { |el| { name: el["name"], title: el["title"] || el["name"] } }
                           .compact
  end
end
