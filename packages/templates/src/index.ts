import Handlebars from 'handlebars';
import { parse as parseYaml } from 'yaml';

export interface Template {
  name: string;
  type: 'markdown' | 'email';
  subject?: string; // for email templates
  body: string;
}

export interface RenderResult {
  md?: string;
  email?: {
    subject: string;
    body: string;
  };
}

// Register helpers
Handlebars.registerHelper('join', function(array: string[], separator: string) {
  return Array.isArray(array) ? array.join(separator) : '';
});

Handlebars.registerHelper('titleCase', function(str: string) {
  return str.replace(/\w\S*/g, txt => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
});

export function render(templateYaml: string, data: any): RenderResult {
  try {
    const template: Template = parseYaml(templateYaml);
    const bodyTemplate = Handlebars.compile(template.body);
    const renderedBody = bodyTemplate(data);
    
    if (template.type === 'email') {
      const subjectTemplate = Handlebars.compile(template.subject || 'Subject');
      const renderedSubject = subjectTemplate(data);
      
      return {
        email: {
          subject: renderedSubject,
          body: renderedBody
        }
      };
    } else {
      return {
        md: renderedBody
      };
    }
  } catch (error) {
    throw new Error(`Template render failed: ${error}`);
  }
}