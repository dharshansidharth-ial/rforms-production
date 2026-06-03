# Seed data for RForms

puts "Seeding organizations..."
org = Organization.find_or_create_by!(domain: "rediff.com") do |o|
  o.name = "Rediff Communications"
  o.primary_color = "#d62929"
  o.accent_color = "#f5a623"
  o.font = "Inter"
  o.default_language = "en"
  o.enabled_languages = ["en"]
end

puts "Seeding users..."
admin = org.users.find_or_create_by!(email: "admin@rediff.com") do |u|
  u.name = "Org Admin"
  u.password = "Admin@1234"
  u.role = "org_admin"
  u.status = "active"
end

creator = org.users.find_or_create_by!(email: "creator@rediff.com") do |u|
  u.name = "Form Creator"
  u.password = "Creator@1234"
  u.role = "form_owner"
  u.status = "active"
end

puts "Seeding templates..."
[
  {
    name: "Employee Onboarding",
    category: "hr",
    description: "Collect new employee information",
    is_global: true,
    schema: {
      title: "Employee Onboarding Form",
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "full_name", title: "Full Name", isRequired: true },
          { type: "text", name: "employee_id", title: "Employee ID" },
          { type: "text", name: "department", title: "Department", isRequired: true },
          { type: "text", name: "manager_email", title: "Manager Email" },
          { type: "radiogroup", name: "employment_type", title: "Employment Type",
            choices: ["Full-time", "Part-time", "Contract"] },
          { type: "datepicker", name: "start_date", title: "Start Date", isRequired: true }
        ]
      }]
    }
  },
  {
    name: "Customer Feedback",
    category: "sales",
    description: "Collect feedback from customers",
    is_global: true,
    schema: {
      title: "Customer Feedback",
      pages: [{
        name: "page1",
        elements: [
          { type: "rating", name: "overall_satisfaction", title: "Overall Satisfaction", rateMin: 1, rateMax: 10 },
          { type: "radiogroup", name: "nps", title: "How likely are you to recommend us?",
            choices: (0..10).map(&:to_s) },
          { type: "comment", name: "what_went_well", title: "What went well?" },
          { type: "comment", name: "improvements", title: "What could we improve?" }
        ]
      }]
    }
  },
  {
    name: "IT Access Request",
    category: "operations",
    description: "Request access to IT resources",
    is_global: true,
    schema: {
      title: "IT Access Request",
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "requester_name", title: "Your Name", isRequired: true },
          { type: "text", name: "resource_name", title: "Resource Requested", isRequired: true },
          { type: "dropdown", name: "access_level", title: "Access Level",
            choices: ["Read Only", "Read/Write", "Admin"] },
          { type: "comment", name: "justification", title: "Business Justification", isRequired: true }
        ]
      }]
    }
  },
  {
    name: "Event Registration",
    category: "event",
    description: "Register attendees for events",
    is_global: true,
    schema: {
      title: "Event Registration",
      pages: [{
        name: "page1",
        elements: [
          { type: "text", name: "name", title: "Full Name", isRequired: true },
          { type: "text", name: "email", title: "Email", validators: [{ type: "email" }], isRequired: true },
          { type: "text", name: "company", title: "Company" },
          { type: "radiogroup", name: "meal_preference", title: "Meal Preference",
            choices: ["Vegetarian", "Non-vegetarian", "Vegan", "No preference"] }
        ]
      }]
    }
  },
  {
    name: "Quiz Template",
    category: "education",
    description: "Create quizzes and assessments",
    is_global: true,
    schema: {
      title: "Knowledge Assessment",
      pages: [{
        name: "page1",
        elements: [
          { type: "radiogroup", name: "q1", title: "What is the capital of France?",
            choices: ["Berlin", "Madrid", "Paris", "Rome"], isRequired: true },
          { type: "radiogroup", name: "q2", title: "2 + 2 = ?",
            choices: ["3", "4", "5", "6"], isRequired: true }
        ]
      }]
    }
  }
].each do |t|
  Template.find_or_create_by!(name: t[:name], is_global: true) do |template|
    template.category = t[:category]
    template.description = t[:description]
    template.schema = t[:schema]
    template.is_global = t[:is_global]
  end
end

puts "Done! Seeded:"
puts "  Org: #{org.name} (#{org.domain})"
puts "  Admin: #{admin.email} / Admin@1234"
puts "  Creator: #{creator.email} / Creator@1234"
puts "  Templates: #{Template.count}"
