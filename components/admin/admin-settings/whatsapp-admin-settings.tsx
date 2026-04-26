"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { 
  MessageCircle,
  TestTube,
  ChevronDown,
  ChevronUp,
  Settings,
  BarChart3,
  Clock,
  Trash2,
  Code,
  CheckCircle2,
  Edit2,
  X,
  RefreshCw,
  Plus
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** WhatsApp template types that support Business Settings → Google Maps link on buttons */
const APPOINTMENT_WHATSAPP_TEMPLATE_TYPES = [
  'appointmentScheduling',
  'appointmentConfirmation',
  'appointmentCancellation',
  'appointmentReminder',
  'appointmentReschedule',
] as const

interface WhatsAppAdminSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

/** Result of parsing template JSON/JS code for variable detection */
interface ParseTemplateResult {
  variableCount: number
  error?: string
  bodyCount?: number
  buttonCount?: number
  allVariables?: string[]
}

/** Shape of WhatsApp settings state */
interface WhatsAppSettingsState {
  enabled: boolean
  provider: string
  msg91ApiKey: string
  msg91SenderId: string
  templates: Record<string, string>
  templateVariables: Record<string, Record<string, string>>
  templateJavaScriptCodes: Record<string, string>
  msg91TemplateId?: string
  /** Legacy admin saves used bare booleans; API now returns nested { enabled, ... } */
  receiptNotifications?: boolean | { enabled?: boolean; autoSendToClients?: boolean; highValueThreshold?: number }
  appointmentNotifications?:
    | boolean
    | { enabled?: boolean; confirmations?: boolean; newAppointments?: boolean; reminders?: boolean; cancellations?: boolean }
  systemAlerts?: boolean | { enabled?: boolean; lowInventory?: boolean; paymentFailures?: boolean }
  clientWalletTransactionNotifications?: boolean | { enabled?: boolean }
  clientWalletExpiryReminderNotifications?: boolean | { enabled?: boolean }
  quietHours?: { enabled: boolean; start: string; end: string }
  [key: string]: unknown
}

/** All MSG91 template slot keys (admin table rows). Deep-merge with API so new slots appear even if the DB document predates them. */
export const EMPTY_WHATSAPP_TEMPLATE_SLOTS: Record<string, string> = {
  welcomeMessage: "",
  businessAccountCreated: "",
  receipt: "",
  receiptCancellation: "",
  appointmentScheduling: "",
  appointmentConfirmation: "",
  appointmentCancellation: "",
  appointmentReminder: "",
  appointmentReschedule: "",
  clientWalletTransaction: "",
  clientWalletExpiryReminder: "",
  default: "",
}

export function WhatsAppAdminSettings({ settings: propSettings, onSettingsChange }: WhatsAppAdminSettingsProps) {
  const { toast } = useToast()
  const [testPhone, setTestPhone] = useState('')
  const [testTemplateType, setTestTemplateType] = useState('default')
  const [isTesting, setIsTesting] = useState(false)
  const [trackingData, setTrackingData] = useState<any>(null)
  const [isLoadingTracking, setIsLoadingTracking] = useState(false)
  const [templateJavaScriptCodes, setTemplateJavaScriptCodes] = useState<Record<string, string>>({})
  const [expandedJsonCodes, setExpandedJsonCodes] = useState<Record<string, boolean>>({})
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [editTemplateId, setEditTemplateId] = useState('')
  const [editJsonCode, setEditJsonCode] = useState('')
  const isInitialMount = useRef(true)

  const [settings, setSettings] = useState<WhatsAppSettingsState>(propSettings || {
    enabled: false,
    provider: "msg91",
    msg91ApiKey: "",
    msg91SenderId: "",
    templates: { ...EMPTY_WHATSAPP_TEMPLATE_SLOTS },
    templateVariables: {}, // Will be auto-populated when JavaScript code is parsed from approved MSG91 templates
    templateJavaScriptCodes: {}, // Store JavaScript code for each template
    // Legacy: Keep for backward compatibility
    msg91TemplateId: "",
    receiptNotifications: { enabled: true, autoSendToClients: true, highValueThreshold: 0 },
    appointmentNotifications: {
      enabled: true,
      confirmations: true,
      newAppointments: true,
      reminders: false,
      cancellations: false,
    },
    systemAlerts: { enabled: false, lowInventory: false, paymentFailures: false },
    clientWalletTransactionNotifications: { enabled: true },
    clientWalletExpiryReminderNotifications: { enabled: true },
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00"
    }
  })

  useEffect(() => {
    // Only update settings if propSettings is defined (not undefined/null)
    // This prevents resetting to defaults when data is still loading
    if (propSettings !== undefined && propSettings !== null) {
      console.log('📥 [WhatsAppAdminSettings] Received propSettings:', {
        enabled: propSettings.enabled,
        enabledType: typeof propSettings.enabled,
        hasEnabled: propSettings.hasOwnProperty('enabled'),
        fullSettings: JSON.stringify(propSettings, null, 2)
      });
      
      // Deep merge to preserve existing state when propSettings updates
      setSettings(prev => {
        // Always use propSettings.enabled if it exists (even if false)
        // This ensures saved state from server is preserved
        const newSettings = {
          ...prev,
          ...propSettings,
          // Explicitly set enabled from propSettings if it exists
          enabled: propSettings.hasOwnProperty('enabled') ? propSettings.enabled : prev.enabled,
          // Preserve nested objects
          templates: {
            ...EMPTY_WHATSAPP_TEMPLATE_SLOTS,
            ...prev.templates,
            ...(propSettings.templates || {}),
          },
          templateVariables: {
            ...prev.templateVariables,
            ...(propSettings.templateVariables || {})
          },
          templateJavaScriptCodes: {
            ...prev.templateJavaScriptCodes,
            ...(propSettings.templateJavaScriptCodes || {})
          },
          clientWalletTransactionNotifications:
            propSettings.clientWalletTransactionNotifications !== undefined
              ? propSettings.clientWalletTransactionNotifications
              : prev.clientWalletTransactionNotifications,
          clientWalletExpiryReminderNotifications:
            propSettings.clientWalletExpiryReminderNotifications !== undefined
              ? propSettings.clientWalletExpiryReminderNotifications
              : prev.clientWalletExpiryReminderNotifications
        };
        
        console.log('📥 [WhatsAppAdminSettings] Setting new settings with enabled:', newSettings.enabled);
        return newSettings;
      })
      // Load template JavaScript codes from settings if they exist
      setTemplateJavaScriptCodes(propSettings.templateJavaScriptCodes || {})
      isInitialMount.current = true
    }
  }, [propSettings])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    
    if (settings && Object.keys(settings).length > 0) {
      const timeoutId = setTimeout(() => {
        onSettingsChange(settings)
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [settings])

  useEffect(() => {
    // Only load tracking data if we have an admin token
    const token = getAdminAuthToken()
    if (token) {
      loadTrackingData()
    }
  }, [])

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = JSON.parse(JSON.stringify(prev)) // Deep clone
      const keys = path.split('.')
      let current = newSettings
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      return newSettings
    })
  }

  /**
   * Extract JSON object from JavaScript code
   * Handles various JavaScript patterns including fetch examples
   */
  const extractJsonFromCode = (code: string): string => {
    // Try to find JSON.stringify(...) pattern - handle multiline with nested braces
    // First, try a simple match
    const jsonStringifyMatch = code.match(/JSON\.stringify\s*\(\s*(\{[\s\S]*?\})\s*\)/);
    if (jsonStringifyMatch) {
      // For nested objects, we need to count braces properly
      let startIdx = code.indexOf('JSON.stringify(') + 'JSON.stringify('.length;
      let braceCount = 0;
      let extracted = '';
      let inString = false;
      let stringChar = '';
      let foundStart = false;
      
      for (let i = startIdx; i < code.length; i++) {
        const char = code[i];
        
        // Handle string literals
        if (!inString && (char === '"' || char === "'")) {
          inString = true;
          stringChar = char;
        } else if (inString && char === stringChar && code[i - 1] !== '\\') {
          inString = false;
        }
        
        // Count braces (only when not in string)
        if (!inString) {
          if (char === '{') {
            braceCount++;
            foundStart = true;
          }
          if (char === '}') {
            braceCount--;
          }
        }
        
        if (foundStart) {
          extracted += char;
        }
        
        // When braces balance, we've found the complete object
        if (foundStart && braceCount === 0 && extracted.trim().length > 0) {
          return extracted.trim();
        }
      }
      
      // Fallback to simple match
      return jsonStringifyMatch[1];
    }
    
    // Try to find var raw = ... or const raw = ... or let raw = ... pattern
    const rawMatch = code.match(/(?:var|const|let)\s+raw\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (rawMatch) {
      return rawMatch[1];
    }
    
    // Try to find var myHeaders or any variable assignment with object
    const varMatch = code.match(/(?:var|const|let)\s+\w+\s*=\s*(\{[\s\S]{50,}\})\s*;/);
    if (varMatch) {
      return varMatch[1];
    }
    
    // Try to find the main payload object (look for integrated_number or content_type)
    const payloadMatch = code.match(/(\{[\s\S]*?"(?:integrated_number|content_type)"[\s\S]*?\})/);
    if (payloadMatch) {
      return payloadMatch[1];
    }
    
    // Try to find any large object literal (at least 50 chars)
    const objectMatch = code.match(/(\{[\s\S]{50,}\})/);
    if (objectMatch) {
      return objectMatch[1];
    }
    
    // If no match, return original (might be pure JSON)
    return code;
  }

  /**
   * Parse MSG91 template JavaScript code to extract variable count
   * Handles JavaScript code examples (fetch, var assignments, etc.)
   */
  const parseTemplateJson = (codeString: string): ParseTemplateResult => {
    try {
      // Always treat input as JavaScript code and extract JSON object
      let jsonToParse = codeString.trim();
      
      // Always try to extract JSON from JavaScript code
      // This handles fetch examples, var assignments, JSON.stringify, etc.
      jsonToParse = extractJsonFromCode(jsonToParse);
      
      // Clean up the extracted code
      let cleaned = jsonToParse
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\/\/.*$/gm, '') // Remove line comments
        .trim();
      
      // Try to parse as JSON
      let json;
      try {
        json = JSON.parse(cleaned);
      } catch (parseError) {
        // If direct parse fails, try to fix common JavaScript issues
        
        // Fix unquoted keys (convert { key: value } to { "key": value })
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
        
        // Fix single quotes to double quotes
        cleaned = cleaned.replace(/'/g, '"');
        
        // Try to extract just the payload object if it exists
        if (cleaned.includes('payload')) {
          const payloadMatch = cleaned.match(/"payload"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
          if (payloadMatch) {
            cleaned = `{"payload":${payloadMatch[1]}}`;
          }
        }
        
        // Try to extract template object
        if (cleaned.includes('template')) {
          const templateMatch = cleaned.match(/"template"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
          if (templateMatch) {
            cleaned = `{"template":${templateMatch[1]}}`;
          }
        }
        
        try {
          json = JSON.parse(cleaned);
        } catch (e) {
          // Last attempt: try to find and extract just the components part
          const componentsMatch = codeString.match(/"components"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
          if (componentsMatch) {
            const componentsJson = `{"components":${componentsMatch[1]}}`;
            try {
              json = JSON.parse(componentsJson);
            } catch (err) {
              return { variableCount: 0, error: `Could not parse JavaScript code. Please ensure the code contains valid JSON structure.` }
            }
          } else {
            return { variableCount: 0, error: `Could not parse JavaScript code. Please ensure the code contains valid JSON structure.` }
          }
        }
      }
      
      // Check for MSG91 API format (with payload.template structure)
      if (json.payload && json.payload.template) {
        const template = json.payload.template;
        
        // Check to_and_components for variable count
        if (template.to_and_components && Array.isArray(template.to_and_components) && template.to_and_components.length > 0) {
          const components = template.to_and_components[0].components;
          if (components) {
            // Count body_1, body_2, etc. (text variables)
            const bodyKeys = Object.keys(components).filter(key => key.startsWith('body_'));
            // Count button_1, button_2, etc. (button variables)
            const buttonKeys = Object.keys(components).filter(key => key.startsWith('button_'));
            
            // Get max number from both body and button variables
            const allNumbers: number[] = [];
            
            if (bodyKeys.length > 0) {
              const bodyNumbers = bodyKeys.map(key => parseInt(key.replace('body_', '')) || 0);
              allNumbers.push(...bodyNumbers);
            }
            
            if (buttonKeys.length > 0) {
              const buttonNumbers = buttonKeys.map(key => parseInt(key.replace('button_', '')) || 0);
              allNumbers.push(...buttonNumbers);
            }
            
            if (allNumbers.length > 0) {
              // Return total count of all variables (body + button)
              // But we need to track them separately for mapping
              return { 
                variableCount: allNumbers.length,
                bodyCount: bodyKeys.length,
                buttonCount: buttonKeys.length,
                allVariables: [...bodyKeys, ...buttonKeys].sort()
              };
            }
          }
        }
      }
      
      // Check for MSG91 template format (with components array)
      if (json.components && Array.isArray(json.components)) {
        let totalVariables = 0
        
        // Find BODY component
        const bodyComponent = json.components.find((comp: any) => comp.type === 'BODY')
        
        if (bodyComponent) {
          // Count parameters if they exist
          if (bodyComponent.parameters && Array.isArray(bodyComponent.parameters)) {
            totalVariables = bodyComponent.parameters.length
          } else if (bodyComponent.text) {
            // Count {{1}}, {{2}}, etc. in the text
            const matches = bodyComponent.text.match(/\{\{(\d+)\}\}/g)
            if (matches) {
              const numbers = matches.map((m: string) => parseInt(m.replace(/\{\{|\}\}/g, '')))
              totalVariables = Math.max(...numbers)
            }
          }
        }
        
        return { variableCount: totalVariables }
      }
      
      // Try to find variables in any text field
      const textFields = JSON.stringify(json).match(/\{\{(\d+)\}\}/g)
      if (textFields) {
        const numbers = textFields.map((m: string) => parseInt(m.replace(/\{\{|\}\}/g, '')))
        return { variableCount: Math.max(...numbers) }
      }
      
      // Try to find body_X and button_X patterns in components
      const bodyPattern = /"body_(\d+)"/g;
      const buttonPattern = /"button_(\d+)"/g;
      const bodyMatches = JSON.stringify(json).match(bodyPattern);
      const buttonMatches = JSON.stringify(json).match(buttonPattern);
      
      const allVariables: string[] = [];
      if (bodyMatches) {
        bodyMatches.forEach(m => {
          const varName = `body_${m.match(/\d+/)![0]}`;
          if (!allVariables.includes(varName)) allVariables.push(varName);
        });
      }
      if (buttonMatches) {
        buttonMatches.forEach(m => {
          const varName = `button_${m.match(/\d+/)![0]}`;
          if (!allVariables.includes(varName)) allVariables.push(varName);
        });
      }
      
      if (allVariables.length > 0) {
        const bodyCount = allVariables.filter(v => v.startsWith('body_')).length;
        const buttonCount = allVariables.filter(v => v.startsWith('button_')).length;
        return { 
          variableCount: allVariables.length,
          bodyCount,
          buttonCount,
          allVariables: allVariables.sort()
        };
      }
      
      return { variableCount: 0, error: 'No variables found in template JSON' }
    } catch (error: any) {
      return { variableCount: 0, error: `Invalid JSON: ${error.message}` }
    }
  }

  /**
   * Auto-configure variable mapping based on parsed JSON
   */
  const handleParseTemplateJson = (templateType: string) => {
    const javascriptCode = templateJavaScriptCodes[templateType]
    if (!javascriptCode || !javascriptCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter JavaScript code first",
        variant: "destructive",
      })
      return
    }

    const result = parseTemplateJson(javascriptCode)
    
    if (result.error) {
      toast({
        title: "Parse Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    if (result.variableCount === 0) {
      toast({
        title: "No Variables Found",
        description: "The template JSON doesn't contain any variables. Please check the format.",
        variant: "destructive",
      })
      return
    }

    // Get default data field names for this template type
    const defaultFields: Record<string, string[]> = {
      welcomeMessage: ['clientName', 'businessName', 'welcomeMessage'],
      businessAccountCreated: ['businessName', 'businessCode', 'adminName', 'loginUrl'],
      receipt: ['clientName', 'businessName', 'receiptLink'],
      receiptCancellation: ['clientName', 'receiptNumber', 'businessName', 'cancellationReason'],
      appointmentScheduling: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'googleMapsUrl'],
      appointmentConfirmation: ['clientName', 'serviceName', 'date', 'time', 'staffName', 'businessName', 'businessPhone', 'googleMapsUrl'],
      appointmentCancellation: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'cancellationReason', 'googleMapsUrl'],
      appointmentReminder: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'businessPhone', 'reminderHours', 'googleMapsUrl'],
      appointmentReschedule: ['clientName', 'serviceName', 'date', 'time', 'staffName', 'businessName', 'businessPhone', 'googleMapsUrl'],
      clientWalletTransaction: [
        'clientName',
        'planName',
        'businessName',
        'transactionTypeLabel',
        'amountFormatted',
        'balanceAfterFormatted',
      ],
      clientWalletExpiryReminder: [
        'clientName',
        'planName',
        'businessName',
        'daysLeft',
        'expiryDateFormatted',
        'balanceFormatted',
      ],
    }

    // Create variable mapping
    const newMapping: Record<string, string> = {}
    const defaultFieldList = defaultFields[templateType] || []
    
    // If we have detected all variables (body + button), use them
    if (result.allVariables && result.allVariables.length > 0) {
      result.allVariables.forEach((varName: string, index: number) => {
        if (varName.startsWith('body_')) {
          // Map body variables to data fields
          const bodyIndex = parseInt(varName.replace('body_', '')) - 1;
          newMapping[varName] = defaultFieldList[bodyIndex] || `variable_${bodyIndex + 1}`;
        } else if (varName.startsWith('button_')) {
          // Map button variables - receipts use receiptLink; appointment templates use salon Google Maps link
          if (templateType === 'receipt') {
            newMapping[varName] = 'receiptLink';
          } else if ((APPOINTMENT_WHATSAPP_TEMPLATE_TYPES as readonly string[]).includes(templateType)) {
            newMapping[varName] = 'googleMapsUrl';
          } else {
            newMapping[varName] = `button_${varName.replace('button_', '')}`;
          }
        }
      });
    } else {
      // Fallback: create body variables only
      for (let i = 1; i <= result.variableCount; i++) {
        const varName = `body_${i}`
        newMapping[varName] = defaultFieldList[i - 1] || `variable_${i}`
      }
    }

    // Update the variable mapping
    handleSettingChange(`templateVariables.${templateType}`, newMapping)

    toast({
      title: "Success",
      description: `Detected ${result.variableCount} variable(s) and configured mapping automatically`,
    })
  }

  /**
   * Handle opening edit modal
   */
  const handleEditTemplate = (templateType: string) => {
    setEditingTemplate(templateType)
    setEditTemplateId(settings.templates?.[templateType] || '')
    setEditJsonCode(templateJavaScriptCodes[templateType] || '')
  }

  /**
   * Handle saving edited template
   */
  const handleSaveEdit = () => {
    if (!editingTemplate) return

    // Update template JavaScript codes in local state first
    const updatedJavaScriptCodes = { ...templateJavaScriptCodes, [editingTemplate]: editJsonCode }
    setTemplateJavaScriptCodes(updatedJavaScriptCodes)
    
    // Build the base new settings object with template ID and JavaScript code
    let finalSettings = {
      ...settings,
      templates: {
        ...(settings.templates || {}),
        [editingTemplate]: editTemplateId
      },
      templateJavaScriptCodes: {
        ...(settings.templateJavaScriptCodes || {}),
        [editingTemplate]: editJsonCode
      },
      // Preserve ALL existing templateVariables - don't clear them unless code is explicitly removed
      templateVariables: {
        ...(settings.templateVariables || {})
      }
    }
    
    // If JavaScript code exists, automatically parse it to detect variables
    if (editJsonCode.trim()) {
      // Parse the code and update variable mappings
      const result = parseTemplateJson(editJsonCode)
      
      if (!result.error && (result.variableCount > 0 || (result.allVariables && result.allVariables.length > 0))) {
        // Get default data field names for this template type
        const defaultFields: Record<string, string[]> = {
          welcomeMessage: ['clientName', 'businessName', 'welcomeMessage'],
          businessAccountCreated: ['businessName', 'businessCode', 'adminName', 'loginUrl'],
          receipt: ['clientName', 'businessName', 'receiptLink'],
          receiptCancellation: ['clientName', 'receiptNumber', 'businessName', 'cancellationReason'],
          appointmentScheduling: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'googleMapsUrl'],
          appointmentConfirmation: ['clientName', 'serviceName', 'date', 'time', 'staffName', 'businessName', 'businessPhone', 'googleMapsUrl'],
          appointmentCancellation: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'cancellationReason', 'googleMapsUrl'],
          appointmentReminder: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'businessPhone', 'reminderHours', 'googleMapsUrl'],
          appointmentReschedule: ['clientName', 'serviceName', 'date', 'time', 'staffName', 'businessName', 'businessPhone', 'googleMapsUrl'],
          clientWalletTransaction: [
            'clientName',
            'planName',
            'businessName',
            'transactionTypeLabel',
            'amountFormatted',
            'balanceAfterFormatted',
          ],
          clientWalletExpiryReminder: [
            'clientName',
            'planName',
            'businessName',
            'daysLeft',
            'expiryDateFormatted',
            'balanceFormatted',
          ],
        }

        // Create variable mapping
        const newMapping: Record<string, string> = {}
        const defaultFieldList = defaultFields[editingTemplate] || []
        
        // If we have detected all variables (body + button), use them
        if (result.allVariables && result.allVariables.length > 0) {
          result.allVariables.forEach((varName: string) => {
            if (varName.startsWith('body_')) {
              // Map body variables to data fields
              const bodyIndex = parseInt(varName.replace('body_', '')) - 1;
              newMapping[varName] = defaultFieldList[bodyIndex] || `variable_${bodyIndex + 1}`;
            } else if (varName.startsWith('button_')) {
              // Map button variables - receipts use receiptLink; appointment templates use Google Maps link
              if (editingTemplate === 'receipt') {
                newMapping[varName] = 'receiptLink';
              } else if ((APPOINTMENT_WHATSAPP_TEMPLATE_TYPES as readonly string[]).includes(editingTemplate)) {
                newMapping[varName] = 'googleMapsUrl';
              } else {
                newMapping[varName] = `button_${varName.replace('button_', '')}`;
              }
            }
          });
        } else {
          // Fallback: create body variables only
          for (let i = 1; i <= result.variableCount; i++) {
            const varName = `body_${i}`
            newMapping[varName] = defaultFieldList[i - 1] || `variable_${i}`
          }
        }

        // Update variable mapping in final settings
        finalSettings.templateVariables = {
          ...(finalSettings.templateVariables || {}),
          [editingTemplate]: newMapping
        }
        
        toast({
          title: "Success",
          description: `Template updated. Detected ${result.allVariables?.length || result.variableCount} variable(s) and configured mapping automatically.`,
        })
      } else {
        // If parsing failed or no variables found, preserve existing mappings if they exist
        // Don't clear them - user might have manually configured them
        toast({
          title: "Success",
          description: "Template updated successfully. No variables detected in code. Existing mappings preserved.",
        })
      }
    } else {
      // If JavaScript code is removed, clear variable mappings for this template
      finalSettings.templateVariables = {
        ...(finalSettings.templateVariables || {}),
        [editingTemplate]: {}
      }
      toast({
        title: "Success",
        description: "Template updated successfully. Variable mappings cleared.",
      })
    }

    // Update local state with final settings
    setSettings(finalSettings)
    
    // Notify parent with complete final settings (only once)
    onSettingsChange(finalSettings)

    setEditingTemplate(null)
    setEditTemplateId('')
    setEditJsonCode('')
  }

  /**
   * Handle deleting template
   */
  const handleDeleteTemplate = (templateType: string) => {
    if (confirm(`Are you sure you want to delete the ${templateType} template configuration?`)) {
      handleSettingChange(`templates.${templateType}`, '')
      
      // Remove from local state
      setTemplateJavaScriptCodes(prev => {
        const newCodes = { ...prev }
        delete newCodes[templateType]
        return newCodes
      })
      
      // Also remove from settings
      handleSettingChange(`templateJavaScriptCodes.${templateType}`, '')
      handleSettingChange(`templateVariables.${templateType}`, {})
      
      toast({
        title: "Success",
        description: "Template deleted successfully",
      })
    }
  }

  /**
   * Toggle template enabled status
   */
  const handleToggleTemplateStatus = (templateType: string, enabled: boolean) => {
    // Store status in a separate field or use template presence as status
    // For now, we'll use whether template ID exists as status
    if (!enabled) {
      handleSettingChange(`templates.${templateType}`, '')
    }
    // If enabling, user needs to configure via edit
  }

  const handleTestWhatsApp = async () => {
    if (!testPhone || testPhone.length < 10) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number",
        variant: "destructive",
      })
      return
    }

    const token = getAdminAuthToken()
    if (!token) {
      toast({
        title: "Error",
        description: "Admin authentication required. Please log in again.",
        variant: "destructive",
      })
      return
    }

    setIsTesting(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const testUrl = `${API_URL}/admin/settings/test/whatsapp`
      
      console.log('🔔 Calling WhatsApp test endpoint:', testUrl)
      
      // Send test settings along with phone number
      const testSettings = {
        enabled: true,
        msg91ApiKey: settings.msg91ApiKey || '',
        msg91SenderId: settings.msg91SenderId || '',
        templates: settings.templates || {},
        msg91TemplateId: settings.msg91TemplateId || '' // Legacy support
      }
      
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: testPhone,
          templateType: testTemplateType,
          settings: testSettings
        })
      })

      if (!response.ok) {
        // Handle 404 specifically
        if (response.status === 404) {
          throw new Error('Test endpoint not found. Please ensure the backend server is running and has been restarted.')
        }
        // Try to parse error response
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: `Test WhatsApp message sent to ${testPhone}`,
        })
      } else {
        throw new Error(data.error || 'Failed to send test WhatsApp message')
      }
    } catch (error: any) {
      console.error('WhatsApp test error:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to send test WhatsApp message",
        variant: "destructive",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const loadTrackingData = async () => {
    setIsLoadingTracking(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = getAdminAuthToken()
      
      if (!token) {
        console.warn('No admin token found, skipping tracking data load')
        setIsLoadingTracking(false)
        return
      }
      
      const response = await fetch(`${API_URL}/whatsapp/tracking/admin`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setTrackingData(data.data)
        }
      } else if (response.status === 401 || response.status === 403) {
        // Don't redirect - just log and show empty state
        console.warn('Unauthorized access to admin tracking - admin token may be invalid')
        setTrackingData(null)
      } else {
        console.error('Error loading tracking data:', response.status, response.statusText)
        setTrackingData(null)
      }
    } catch (error) {
      console.error('Error loading tracking data:', error)
      setTrackingData(null)
    } finally {
      setIsLoadingTracking(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable WhatsApp Notifications</Label>
              <p className="text-xs text-gray-500">
                Send notifications via WhatsApp
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
            />
          </div>

          {settings.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="msg91ApiKey">MSG91 API Key</Label>
                  <Input
                    id="msg91ApiKey"
                    type="password"
                    value={settings.msg91ApiKey || ''}
                    onChange={(e) => handleSettingChange('msg91ApiKey', e.target.value)}
                    className="w-full"
                    placeholder="Your MSG91 Auth Key"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="msg91SenderId">Sender ID</Label>
                  <Input
                    id="msg91SenderId"
                    value={settings.msg91SenderId || ''}
                    onChange={(e) => handleSettingChange('msg91SenderId', e.target.value)}
                    className="w-full"
                    placeholder="919876543210"
                  />
                  <p className="text-xs text-gray-500">
                    Your WhatsApp phone number registered with MSG91 (found in Dashboard → WhatsApp → Sender ID). Format: 91XXXXXXXXXX
                  </p>
                </div>
              </div>

              {/* Template Configuration */}
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">WhatsApp Templates Configuration</Label>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 border-b border-slate-200">
                        <TableHead className="w-[200px]">Template Name</TableHead>
                        <TableHead className="w-[200px]">Template ID</TableHead>
                        <TableHead className="w-[300px]">Code (JavaScript)</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[150px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(settings.templates || {}).filter(key => key !== 'default').map((templateType) => {
                        const templateName = templateType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                        const templateId = settings.templates?.[templateType] || ''
                        const javascriptCode = templateJavaScriptCodes[templateType] || ''
                        const isExpanded = expandedJsonCodes[templateType] || false
                        const isActive = !!templateId
                        
                        return (
                          <TableRow key={templateType}>
                            <TableCell className="font-medium">{templateName}</TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-600">{templateId || '-'}</span>
                            </TableCell>
                            <TableCell>
                              {javascriptCode ? (
                                <div className="space-y-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpandedJsonCodes(prev => ({ ...prev, [templateType]: !isExpanded }))}
                                    className="h-6 text-xs p-1"
                                    title={isExpanded ? "Hide code" : "Show code"}
                                  >
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    <Code className="h-3 w-3 ml-1" />
                                  </Button>
                                  {isExpanded && (
                                    <div className="mt-1 p-2 bg-gray-50 rounded border text-xs font-mono max-h-[200px] overflow-auto">
                                      <pre className="whitespace-pre-wrap">{javascriptCode}</pre>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={isActive}
                                onCheckedChange={(checked) => {
                                  if (checked && !templateId) {
                                    handleEditTemplate(templateType)
                                  } else if (!checked) {
                                    handleToggleTemplateStatus(templateType, false)
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditTemplate(templateType)}
                                  className="h-7 w-7 p-0"
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTemplate(templateType)}
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Template Variable Mapping Configuration */}
                {/* Only show if templates have JavaScript code (meaning they've been configured with approved templates) */}
                {Object.keys(templateJavaScriptCodes).filter(key => templateJavaScriptCodes[key] && templateJavaScriptCodes[key].trim().length > 0).length > 0 && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Template Variable Mapping</Label>
                      <p className="text-xs text-gray-500">
                        Configure how template variables (body_1, body_2, button_1, etc.) map to data fields
                      </p>
                    </div>

                    <div className="space-y-4">
                      {Object.keys(settings.templates || {}).filter(key => key !== 'default').map((templateType) => {
                        const templateName = templateType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                        const variableMapping = settings.templateVariables?.[templateType] || {};
                        const hasJavaScriptCode = templateJavaScriptCodes[templateType] && templateJavaScriptCodes[templateType].trim().length > 0;
                        
                        // Only show if template has JavaScript code (approved template with code pasted)
                        if (!hasJavaScriptCode) {
                          return null;
                        }

                        return (
                          <div key={templateType} className="p-4 border rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium text-sm">{templateName} Template Variables</h4>
                              {hasJavaScriptCode && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleParseTemplateJson(templateType)}
                                  className="text-xs h-7"
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Re-parse & Auto-Configure
                                </Button>
                              )}
                            </div>
                            
                            {Object.keys(variableMapping).length > 0 ? (
                              <div className="space-y-2">
                                {Object.entries(variableMapping).map(([varName, dataField]) => (
                                  <div key={varName} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                                    <div className="flex-1">
                                      <Label className="text-xs font-mono text-gray-600">{varName}</Label>
                                      <Select
                                        value={String(dataField)}
                                        onValueChange={(value) => {
                                          const newMapping = { ...variableMapping, [varName]: value };
                                          handleSettingChange(`templateVariables.${templateType}`, newMapping);
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="clientName">Client Name</SelectItem>
                                          <SelectItem value="businessName">Business Name</SelectItem>
                                          <SelectItem value="businessCode">Business Code</SelectItem>
                                          <SelectItem value="receiptNumber">Receipt Number</SelectItem>
                                          <SelectItem value="receiptLink">Receipt Link</SelectItem>
                                          <SelectItem value="googleMapsUrl">Google Maps Link</SelectItem>
                                          <SelectItem value="serviceName">Service Name</SelectItem>
                                          <SelectItem value="date">Date</SelectItem>
                                          <SelectItem value="time">Time</SelectItem>
                                          <SelectItem value="staffName">Staff Name</SelectItem>
                                          <SelectItem value="businessPhone">Business Phone</SelectItem>
                                          <SelectItem value="cancellationReason">Cancellation Reason</SelectItem>
                                          <SelectItem value="adminName">Admin Name</SelectItem>
                                          <SelectItem value="loginUrl">Login URL</SelectItem>
                                          <SelectItem value="welcomeMessage">Welcome Message</SelectItem>
                                          <SelectItem value="reminderHours">Reminder Hours</SelectItem>
                                          {templateType === "clientWalletTransaction" ? (
                                            <>
                                              <SelectItem value="planName">Plan name (wallet)</SelectItem>
                                              <SelectItem value="transactionType">Transaction type (code)</SelectItem>
                                              <SelectItem value="transactionTypeLabel">Transaction type (label)</SelectItem>
                                              <SelectItem value="amountFormatted">Amount (formatted)</SelectItem>
                                              <SelectItem value="balanceAfterFormatted">Balance after (formatted)</SelectItem>
                                              <SelectItem value="description">Description</SelectItem>
                                            </>
                                          ) : null}
                                          {templateType === "clientWalletExpiryReminder" ? (
                                            <>
                                              <SelectItem value="planName">Plan name (wallet)</SelectItem>
                                              <SelectItem value="daysLeft">Days until expiry</SelectItem>
                                              <SelectItem value="expiryDateFormatted">Expiry date (formatted)</SelectItem>
                                              <SelectItem value="balanceFormatted">Current balance (formatted)</SelectItem>
                                            </>
                                          ) : null}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newMapping = { ...variableMapping };
                                        delete newMapping[varName];
                                        handleSettingChange(`templateVariables.${templateType}`, newMapping);
                                      }}
                                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      title="Remove variable"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    // Add next variable (body_X or button_X)
                                    const existingVars = Object.keys(variableMapping);
                                    const bodyVars = existingVars.filter(v => v.startsWith('body_')).map(v => parseInt(v.replace('body_', ''))).sort((a, b) => b - a);
                                    const buttonVars = existingVars.filter(v => v.startsWith('button_')).map(v => parseInt(v.replace('button_', ''))).sort((a, b) => b - a);
                                    
                                    let nextVarName = '';
                                    if (bodyVars.length > 0) {
                                      nextVarName = `body_${bodyVars[0] + 1}`;
                                    } else if (buttonVars.length > 0) {
                                      nextVarName = `button_${buttonVars[0] + 1}`;
                                    } else {
                                      nextVarName = 'body_1';
                                    }
                                    
                                    const newMapping = { ...variableMapping, [nextVarName]: '' };
                                    handleSettingChange(`templateVariables.${templateType}`, newMapping);
                                  }}
                                  className="w-full text-xs h-7"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add Variable
                                </Button>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
                                No variables detected yet. Click "Re-parse & Auto-Configure" to detect variables from your JavaScript code.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>


              <div className="space-y-2">
                <Label>Test WhatsApp Configuration</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Select value={testTemplateType} onValueChange={setTestTemplateType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Template</SelectItem>
                      <SelectItem value="welcomeMessage">Welcome Message</SelectItem>
                      <SelectItem value="businessAccountCreated">Business Account Created</SelectItem>
                      <SelectItem value="receipt">Receipt/Bill</SelectItem>
                      <SelectItem value="receiptCancellation">Bill Cancellation</SelectItem>
                      <SelectItem value="appointmentScheduling">Appointment Scheduling</SelectItem>
                      <SelectItem value="appointmentConfirmation">Appointment Confirmation</SelectItem>
                      <SelectItem value="appointmentCancellation">Appointment Cancellation</SelectItem>
                      <SelectItem value="appointmentReminder">Appointment Reminder</SelectItem>
                      <SelectItem value="appointmentReschedule">Appointment Reschedule</SelectItem>
                      <SelectItem value="clientWalletTransaction">Prepaid wallet transaction</SelectItem>
                      <SelectItem value="clientWalletExpiryReminder">Prepaid wallet expiry reminder</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="tel"
                    placeholder="Phone number (e.g., 919876543210)"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleTestWhatsApp} 
                    variant="outline"
                    disabled={isTesting || !testPhone}
                    className="w-full"
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {isTesting ? 'Sending...' : 'Test WhatsApp'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Select a template type and enter a phone number to test. The template must be configured above.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <span>Notification Preferences</span>
          </CardTitle>
          <CardDescription>
            Configure which notifications to send via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Receipt Notifications</Label>
              <p className="text-xs text-gray-500">
                Send receipt links via WhatsApp
              </p>
            </div>
            <Switch
              checked={
                typeof settings.receiptNotifications === 'boolean'
                  ? settings.receiptNotifications
                  : (settings.receiptNotifications?.enabled ?? false)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.receiptNotifications === 'object' && settings.receiptNotifications !== null
                    ? settings.receiptNotifications
                    : { autoSendToClients: true as boolean, highValueThreshold: 0 };
                handleSettingChange('receiptNotifications', { ...prev, enabled: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Appointment Notifications</Label>
              <p className="text-xs text-gray-500">
                Send appointment confirmations via WhatsApp
              </p>
            </div>
            <Switch
              checked={
                typeof settings.appointmentNotifications === 'boolean'
                  ? settings.appointmentNotifications
                  : (settings.appointmentNotifications?.enabled ?? false)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.appointmentNotifications === 'object' &&
                  settings.appointmentNotifications !== null
                    ? settings.appointmentNotifications
                    : { reminders: false, cancellations: false };
                handleSettingChange('appointmentNotifications', {
                  ...prev,
                  enabled: checked,
                  ...(checked
                    ? { confirmations: true, newAppointments: true }
                    : { confirmations: false, newAppointments: false }),
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">System Alerts</Label>
              <p className="text-xs text-gray-500">
                Send system alerts via WhatsApp
              </p>
            </div>
            <Switch
              checked={
                typeof settings.systemAlerts === 'boolean'
                  ? settings.systemAlerts
                  : (settings.systemAlerts?.enabled ?? false)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.systemAlerts === 'object' && settings.systemAlerts !== null
                    ? settings.systemAlerts
                    : { lowInventory: false, paymentFailures: false };
                handleSettingChange('systemAlerts', { ...prev, enabled: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Prepaid wallet activity WhatsApp</Label>
              <p className="text-xs text-gray-500">
                When enabled, salons may send approved template messages for wallet credits, debits, adjustments, and
                refunds (per-salon toggle in business WhatsApp settings).
              </p>
            </div>
            <Switch
              checked={
                typeof settings.clientWalletTransactionNotifications === "boolean"
                  ? settings.clientWalletTransactionNotifications
                  : (settings.clientWalletTransactionNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.clientWalletTransactionNotifications === "object" &&
                  settings.clientWalletTransactionNotifications !== null
                    ? settings.clientWalletTransactionNotifications
                    : { enabled: true }
                handleSettingChange("clientWalletTransactionNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Prepaid wallet expiry reminder WhatsApp</Label>
              <p className="text-xs text-gray-500">
                When enabled, salons may send the approved 30/15/7-day expiry template (also requires salon WhatsApp
                settings and Prepaid wallet expiry alerts).
              </p>
            </div>
            <Switch
              checked={
                typeof settings.clientWalletExpiryReminderNotifications === "boolean"
                  ? settings.clientWalletExpiryReminderNotifications
                  : (settings.clientWalletExpiryReminderNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.clientWalletExpiryReminderNotifications === "object" &&
                  settings.clientWalletExpiryReminderNotifications !== null
                    ? settings.clientWalletExpiryReminderNotifications
                    : { enabled: true }
                handleSettingChange("clientWalletExpiryReminderNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Quiet Hours</Label>
                <p className="text-xs text-gray-500">
                  Disable WhatsApp messages during specified hours
                </p>
              </div>
              <Switch
                checked={settings.quietHours?.enabled}
                onCheckedChange={(checked) => handleSettingChange('quietHours.enabled', checked)}
              />
            </div>

            {settings.quietHours?.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quietStart">Start Time</Label>
                  <Input
                    id="quietStart"
                    type="time"
                    value={settings.quietHours?.start || '22:00'}
                    onChange={(e) => handleSettingChange('quietHours.start', e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quietEnd">End Time</Label>
                  <Input
                    id="quietEnd"
                    type="time"
                    value={settings.quietHours?.end || '08:00'}
                    onChange={(e) => handleSettingChange('quietHours.end', e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <span>WhatsApp Usage & Tracking</span>
          </CardTitle>
          <CardDescription>
            View system-wide WhatsApp message statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTracking ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p>Loading tracking data...</p>
            </div>
          ) : trackingData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Messages</p>
                  <p className="text-2xl font-bold text-blue-600">{trackingData.totalMessages || 0}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">{trackingData.successRate || 0}%</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-600">Failed Messages</p>
                  <p className="text-2xl font-bold text-red-600">{trackingData.failedMessages || 0}</p>
                </div>
              </div>

              {trackingData.businessStats && trackingData.businessStats.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Messages by Business</h4>
                  <div className="space-y-2">
                    {trackingData.businessStats.slice(0, 10).map((stat: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium">{stat.businessName}</span>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline">{stat.sent} sent</Badge>
                          <Badge variant="destructive">{stat.failed} failed</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No tracking data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Template Modal — key remounts dialog when template changes (avoids Radix Dialog hook order issues with React 19) */}
      <Dialog
        key={editingTemplate ?? "closed"}
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Edit {editingTemplate ? editingTemplate.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) : ''} Template
            </DialogTitle>
            <DialogDescription>
              Configure the template ID and JavaScript code. The system will automatically extract JSON from JavaScript and parse variables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTemplateId">Template ID</Label>
              <Input
                id="editTemplateId"
                value={editTemplateId}
                onChange={(e) => setEditTemplateId(e.target.value)}
                placeholder="Enter template ID (e.g., welcome_message)"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="editJsonCode">JavaScript Code</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Check if we have the required data
                    if (!editingTemplate) {
                      toast({
                        title: "Error",
                        description: "No template selected for editing",
                        variant: "destructive",
                      })
                      return
                    }

                    const codeToParse = editJsonCode?.trim() || ''
                    if (!codeToParse) {
                      toast({
                        title: "Error",
                        description: "Please paste your JavaScript code in the textarea above first",
                        variant: "destructive",
                      })
                      return
                    }

                    // Parse the JavaScript code directly from editJsonCode
                    console.log('Parsing JavaScript code, length:', codeToParse.length);
                    const result = parseTemplateJson(codeToParse)
                    console.log('Parse result:', result);
                    
                    if (result.error) {
                      toast({
                        title: "Parse Error",
                        description: result.error + (codeToParse.length > 0 ? ` (Code length: ${codeToParse.length} chars)` : ''),
                        variant: "destructive",
                      })
                      return
                    }

                    if (result.variableCount === 0 && (!result.allVariables || result.allVariables.length === 0)) {
                      toast({
                        title: "No Variables Found",
                        description: "The template JavaScript code doesn't contain any variables (body_1, body_2, button_1, etc.). Please check the format.",
                        variant: "destructive",
                      })
                      return
                    }

                      // Get default data field names for this template type
                      const defaultFields: Record<string, string[]> = {
                        welcomeMessage: ['clientName', 'businessName', 'welcomeMessage'],
                        businessAccountCreated: ['businessName', 'businessCode', 'adminName', 'loginUrl'],
                        receipt: ['clientName', 'businessName', 'receiptLink'],
                        receiptCancellation: ['clientName', 'receiptNumber', 'businessName', 'cancellationReason'],
                        appointmentScheduling: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'googleMapsUrl'],
                        appointmentConfirmation: ['clientName', 'serviceName', 'date', 'time', 'staffName', 'businessName', 'businessPhone', 'googleMapsUrl'],
                        appointmentCancellation: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'cancellationReason', 'googleMapsUrl'],
                        appointmentReminder: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'businessPhone', 'reminderHours', 'googleMapsUrl'],
                        appointmentReschedule: ['clientName', 'serviceName', 'date', 'time', 'staffName', 'businessName', 'businessPhone', 'googleMapsUrl'],
                        clientWalletTransaction: [
                          'clientName',
                          'planName',
                          'businessName',
                          'transactionTypeLabel',
                          'amountFormatted',
                          'balanceAfterFormatted',
                        ],
                        clientWalletExpiryReminder: [
                          'clientName',
                          'planName',
                          'businessName',
                          'daysLeft',
                          'expiryDateFormatted',
                          'balanceFormatted',
                        ],
                      }

                      // Create variable mapping
                      const newMapping: Record<string, string> = {}
                      const defaultFieldList = defaultFields[editingTemplate] || []
                      
                      // If we have detected all variables (body + button), use them
                      if (result.allVariables && result.allVariables.length > 0) {
                        result.allVariables.forEach((varName: string, index: number) => {
                          if (varName.startsWith('body_')) {
                            // Map body variables to data fields
                            const bodyIndex = parseInt(varName.replace('body_', '')) - 1;
                            newMapping[varName] = defaultFieldList[bodyIndex] || `variable_${bodyIndex + 1}`;
                          } else if (varName.startsWith('button_')) {
                            // Map button variables - receipts use receiptLink; appointment templates use Google Maps link
                            if (editingTemplate === 'receipt') {
                              newMapping[varName] = 'receiptLink';
                            } else if ((APPOINTMENT_WHATSAPP_TEMPLATE_TYPES as readonly string[]).includes(editingTemplate)) {
                              newMapping[varName] = 'googleMapsUrl';
                            } else {
                              newMapping[varName] = `button_${varName.replace('button_', '')}`;
                            }
                          }
                        });
                      } else {
                        // Fallback: create body variables only
                        for (let i = 1; i <= result.variableCount; i++) {
                          const varName = `body_${i}`
                          newMapping[varName] = defaultFieldList[i - 1] || `variable_${i}`
                        }
                      }

                      // Update the variable mapping in settings
                      handleSettingChange(`templateVariables.${editingTemplate}`, newMapping)

                      toast({
                        title: "Success",
                        description: `Detected ${result.allVariables?.length || result.variableCount} variable(s) and configured mapping automatically`,
                      })
                  }}
                  className="text-xs"
                  disabled={!editJsonCode.trim()}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Parse & Auto-Configure
                </Button>
              </div>
              <Textarea
                id="editJsonCode"
                value={editJsonCode}
                onChange={(e) => setEditJsonCode(e.target.value)}
                placeholder="Paste your MSG91 JavaScript code here (fetch example, var raw = {...}, etc.)..."
                className="font-mono text-xs min-h-[200px]"
              />
              <p className="text-xs text-gray-500">
                Paste the JavaScript code from MSG91 (fetch example, var raw = JSON.stringify(...), etc.). The system will extract the JSON payload and detect variables automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

