import React, { useState, useEffect } from 'react';
import {
  Database,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Shield,
  Key,
  Globe,
  Hash,
  FileText,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Code,
  Layers,
  ArrowRight,
  HelpCircle,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Sliders,
  Edit2,
  FolderPlus,
  X,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { TestCase, Project, DatasetAiAuditResult } from '../types';
import { datasetService, FirestoreDataset } from '../services/firebase';
import { api } from '../services/api';
import { ConfirmModal } from './ConfirmModal';
import { AlertModal } from './AlertModal';
import { DatasetGuidedLearningModal } from './DatasetGuidedLearningModal';
import { DatasetQualityModal } from './DatasetQualityModal';
import { DatasetGuidedTour } from './DatasetGuidedTour';

interface DatasetConfiguratorProps {
  project: Project;
  testCases: TestCase[];
  allNeededFields: string[];
  missingProjectFields: string[];
  dataset: Record<string, any>;
  onSaveDataset: (newDataset: Record<string, any>) => Promise<void>;
  onRunTestCase?: (testCase: TestCase, mode: 'preview' | 'hosted') => void;
}

type VariableCategory = 'auth' | 'env' | 'ids' | 'params' | 'custom';

interface VariableMeta {
  key: string;
  value: any;
  category: VariableCategory;
  isMissing: boolean;
  isSecret: boolean;
  usedByCases: TestCase[];
  description: string;
  example: string;
  quality: {
    status: 'valid' | 'warning' | 'missing' | 'invalid';
    issue?: string;
    autoFix?: any;
    score: number;
  };
}

export const DatasetConfigurator: React.FC<DatasetConfiguratorProps> = ({
  project,
  testCases,
  allNeededFields,
  missingProjectFields,
  dataset,
  onSaveDataset,
  onRunTestCase,
}) => {
  // Mode: 'visual' guided form or 'json' advanced editor
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [localDataset, setLocalDataset] = useState<Record<string, any>>(dataset || {});
  const [rawJsonText, setRawJsonText] = useState<string>(JSON.stringify(dataset || {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // New variable form
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [isAddingVariable, setIsAddingVariable] = useState(false);

  // Visibility toggle for secrets
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  // Active simulated test case for Step 4 (Resolution Preview)
  const [selectedSimCaseId, setSelectedSimCaseId] = useState<string>(testCases?.[0]?.id || '');
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'missing' | 'auth' | 'ids'>('all');

  // Firestore Datasets Management State (Full CRUD)
  const [firestoreDatasets, setFirestoreDatasets] = useState<FirestoreDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [isEditDatasetModalOpen, setIsEditDatasetModalOpen] = useState(false);
  const [datasetFormName, setDatasetFormName] = useState('');
  const [datasetFormEnv, setDatasetFormEnv] = useState('staging');
  const [datasetFormDesc, setDatasetFormDesc] = useState('');
  const [cloneCurrentVars, setCloneCurrentVars] = useState(true);

  // Guided Learning, Quality Audit & Guided Tour State
  const [isGuidedLearningOpen, setIsGuidedLearningOpen] = useState(false);
  const [learningVariableKey, setLearningVariableKey] = useState('');
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [auditResult, setAuditResult] = useState<DatasetAiAuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);


  // In-app Confirm & Alert Modals (avoids window.confirm/alert in sandboxed iframe)
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [alertModalState, setAlertModalState] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'error' | 'success' | 'info';
  }>({
    isOpen: false,
    message: '',
  });

  const showAlert = (message: string, title?: string, type: 'error' | 'success' | 'info' = 'error') => {
    setAlertModalState({
      isOpen: true,
      title,
      message,
      type,
    });
  };

  // Sync state when props change
  useEffect(() => {
    setLocalDataset(dataset || {});
    setRawJsonText(JSON.stringify(dataset || {}, null, 2));
    setJsonError(null);
  }, [dataset]);

  // Subscribe to real-time Firestore Datasets for this project
  useEffect(() => {
    if (!project?.id) return;
    const unsubscribe = datasetService.subscribeDatasets(project.id, (list) => {
      const validList = Array.isArray(list) ? list.filter(d => d && d.id) : [];
      setFirestoreDatasets(validList);
      if (validList.length > 0) {
        // If no dataset selected or current is invalid, select the default or first
        setSelectedDatasetId(prev => {
          if (prev && validList.some(d => d.id === prev)) {
            return prev;
          }
          const def = validList.find(d => d.isDefault) || validList[0];
          return def?.id || validList[0]?.id || '';
        });
      }
    });

    return () => unsubscribe();
  }, [project?.id]);

  // Handle switching active dataset from Firestore
  const handleSwitchDataset = (id: string) => {
    setSelectedDatasetId(id);
    const target = firestoreDatasets.find(d => d.id === id);
    if (target) {
      setLocalDataset(target.variables || {});
      setRawJsonText(JSON.stringify(target.variables || {}, null, 2));
      onSaveDataset(target.variables || {});
    }
  };

  // Firestore CRUD: Create New Dataset
  const handleCreateNewDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetFormName.trim() || !project?.id) return;
    try {
      setIsSaving(true);
      const newDs = await datasetService.createDataset({
        projectId: project.id,
        name: datasetFormName.trim(),
        environment: datasetFormEnv,
        description: datasetFormDesc.trim(),
        variables: cloneCurrentVars ? localDataset : { baseUrl: project?.siteUrl || '' },
        isDefault: firestoreDatasets.length === 0,
      });
      setSelectedDatasetId(newDs.id);
      setLocalDataset(newDs.variables);
      setRawJsonText(JSON.stringify(newDs.variables, null, 2));
      await onSaveDataset(newDs.variables);
      setIsNewDatasetModalOpen(false);
      setDatasetFormName('');
      setDatasetFormDesc('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      showAlert('Failed to create dataset in Firestore: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Firestore CRUD: Update Dataset Metadata
  const handleUpdateDatasetMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDatasetId || !datasetFormName.trim()) return;
    try {
      setIsSaving(true);
      await datasetService.updateDataset(selectedDatasetId, {
        name: datasetFormName.trim(),
        environment: datasetFormEnv,
        description: datasetFormDesc.trim(),
      });
      setIsEditDatasetModalOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      showAlert('Failed to update dataset in Firestore: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Firestore CRUD: Delete Dataset (In-App Confirm)
  const handleDeleteDataset = () => {
    if (!selectedDatasetId) return;
    if (firestoreDatasets.length <= 1) {
      showAlert('A project must have at least one active dataset in Firestore.', 'Cannot Delete Default Dataset');
      return;
    }
    const current = firestoreDatasets.find(d => d.id === selectedDatasetId);
    setConfirmModalState({
      isOpen: true,
      title: 'Delete Dataset',
      message: `Are you sure you want to delete dataset "${current?.name || 'this dataset'}" from Firestore?`,
      confirmText: 'Delete Dataset',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setIsSaving(true);
          await datasetService.deleteDataset(selectedDatasetId);
          const remaining = firestoreDatasets.filter(d => d.id !== selectedDatasetId);
          if (remaining.length > 0) {
            handleSwitchDataset(remaining[0].id);
          }
        } catch (err: any) {
          showAlert('Failed to delete dataset: ' + err.message);
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  // Helper to read dotted path from object
  const getNestedValue = (obj: any, path: string): any => {
    if (!obj) return undefined;
    if (obj[path] !== undefined) return obj[path];
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  };

  // Helper to set dotted path into object
  const setNestedValue = (obj: any, path: string, val: any): any => {
    const clone = JSON.parse(JSON.stringify(obj));
    if (path.includes('.')) {
      const parts = path.split('.');
      let cur = clone;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== 'object') {
          cur[p] = {};
        }
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = val;
    } else {
      clone[path] = val;
    }
    return clone;
  };

  // Helper to delete dotted path
  const deleteNestedValue = (obj: any, path: string): any => {
    const clone = JSON.parse(JSON.stringify(obj));
    if (clone[path] !== undefined) {
      delete clone[path];
    }
    if (path.includes('.')) {
      const parts = path.split('.');
      let cur = clone;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]]) return clone;
        cur = cur[parts[i]];
      }
      delete cur[parts[parts.length - 1]];
    }
    return clone;
  };

  // Categorize a field
  const categorizeField = (k: string): VariableCategory => {
    const lk = k.toLowerCase();
    if (lk.includes('jwt_secret') || lk.includes('jwtsecret') || lk.includes('auth') || lk.includes('token') || lk.includes('jwt') || lk.includes('key') || lk.includes('secret') || lk.includes('pass')) {
      return 'auth';
    }
    if (lk.includes('vite_api_url') || lk.includes('cors_allowed_origins') || lk.includes('corsallowedorigins') || lk.includes('url') || lk.includes('host') || lk.includes('domain') || lk.includes('env') || lk.includes('port')) {
      return 'env';
    }
    if (lk.includes('id') || lk.includes('uuid') || lk.includes('slug') || lk.endsWith('_num')) {
      return 'ids';
    }
    if (lk.includes('search') || lk.includes('email') || lk.includes('name') || lk.includes('status') || lk.includes('query')) {
      return 'params';
    }
    return 'custom';
  };

  // Generate realistic synthetic value based on key name
  const generateSyntheticValue = (k: string): any => {
    const lk = k.toLowerCase();
    if (k === 'JWT_SECRET' || k === 'jwtSecret') {
      return `sec_jwt_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
    }
    if (k === 'VITE_API_URL' || k === 'apiUrl') {
      return project.siteUrl;
    }
    if (k === 'CORS_ALLOWED_ORIGINS' || k === 'corsAllowedOrigins') {
      return `${project.siteUrl},http://localhost:3000`;
    }
    if (lk.includes('token') || lk.includes('jwt') || lk.includes('bearer')) {
      return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImF1ZCI6InZlcml0eS1xYSIsImlhdCI6MTY3MjUzMTAwMH0.mock_signature_${Math.random().toString(36).substring(2, 10)}`;
    }
    if (lk.includes('apikey') || lk.includes('api_key')) {
      return `vrt_live_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 10)}`;
    }
    if (lk.includes('email')) {
      return `qa.tester_${Math.floor(Math.random() * 900 + 100)}@example.com`;
    }
    if (lk.includes('id') || lk.includes('uuid')) {
      return String(Math.floor(Math.random() * 990 + 10));
    }
    if (lk.includes('search') || lk.includes('query')) {
      return 'active_status_q';
    }
    if (lk.includes('url') || lk.includes('domain')) {
      return project.siteUrl;
    }
    if (lk.includes('name')) {
      return `Sample QA Entity ${Math.floor(Math.random() * 100)}`;
    }
    return `synthetic_${k}_${Math.random().toString(36).substring(2, 7)}`;
  };

  // Live quality assessment for any variable
  const getFieldQuality = (key: string, value: any): {
    status: 'valid' | 'warning' | 'missing' | 'invalid';
    issue?: string;
    autoFix?: any;
    score: number;
  } => {
    const valStr = value !== undefined && value !== null ? String(value).trim() : '';
    if (valStr === '') return { status: 'missing', issue: 'Missing or empty value', score: 0 };
    if (valStr.includes('{{') && valStr.includes('}}')) {
      return { status: 'invalid', issue: 'Contains unresolved template brackets {{...}}', score: 20 };
    }

    const lk = key.toLowerCase();
    // Auth Token Specific Checks
    if (lk.includes('token') || lk.includes('jwt') || lk.includes('auth')) {
      if (valStr.length < 10) {
        return { status: 'warning', issue: 'Token string appears unusually short', score: 40 };
      }
      const dotCount = (valStr.match(/\./g) || []).length;
      if (dotCount === 2 && !valStr.toLowerCase().startsWith('bearer ')) {
        return {
          status: 'warning',
          issue: 'Missing "Bearer " prefix',
          autoFix: `Bearer ${valStr}`,
          score: 75,
        };
      }
    }

    // URL checks
    if (lk.includes('url') || lk.includes('host') || lk.includes('domain')) {
      if (!/^https?:\/\//i.test(valStr)) {
        return {
          status: 'invalid',
          issue: 'Missing https:// or http:// protocol',
          autoFix: `https://${valStr.replace(/^\/+/, '')}`,
          score: 25,
        };
      }
      if (valStr.endsWith('/')) {
        return {
          status: 'warning',
          issue: 'Trailing slash may cause double slashes in paths',
          autoFix: valStr.replace(/\/+$/, ''),
          score: 85,
        };
      }
    }

    // Placeholder check
    if (/^(TODO|placeholder|replace_me|your_token_here|sample_value|dummy_token)/i.test(valStr)) {
      return { status: 'warning', issue: 'Value is a placeholder text', score: 45 };
    }

    return { status: 'valid', score: 100 };
  };

  // Compile list of all variables (both needed by test cases and present in dataset)
  const getAllVariables = (): VariableMeta[] => {
    const keysSet = new Set<string>();
    allNeededFields.forEach(f => keysSet.add(f));

    // Guarantee presence of critical target application configuration keys
    keysSet.add('VITE_API_URL');
    keysSet.add('JWT_SECRET');
    keysSet.add('CORS_ALLOWED_ORIGINS');

    // Extract top-level keys and nested keys from dataset
    const extractKeys = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      Object.keys(obj).forEach(k => {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
          extractKeys(obj[k], fullKey);
        } else {
          keysSet.add(fullKey);
        }
      });
    };
    extractKeys(localDataset);

    const list: VariableMeta[] = [];
    keysSet.forEach(k => {
      let val = getNestedValue(localDataset, k);
      if (k === 'VITE_API_URL' && !val && localDataset.apiUrl) val = localDataset.apiUrl;
      if (k === 'JWT_SECRET' && !val && localDataset.jwtSecret) val = localDataset.jwtSecret;
      if (k === 'CORS_ALLOWED_ORIGINS' && !val && localDataset.corsAllowedOrigins) val = localDataset.corsAllowedOrigins;

      const isMissing = val === undefined || val === null || val === '';
      const category = categorizeField(k);
      const isSecret = category === 'auth' || k.toLowerCase().includes('key') || k.toLowerCase().includes('secret');
      
      const usedByCases = testCases.filter(c => {
        const json = JSON.stringify(c.spec);
        return json.includes(`{{${k}}}`);
      });

      let description = 'Custom dynamic configuration value.';
      let example = 'e.g. "production" or "10"';
      if (k === 'VITE_API_URL' || k === 'apiUrl') {
        description = 'Target backend API URL. In a multi-application portal, routes test requests to this host if different from site URL.';
        example = `e.g. ${project.siteUrl} or https://api.example.com`;
      } else if (k === 'JWT_SECRET' || k === 'jwtSecret') {
        description = 'Target application JWT signing secret. When set, runner signs real JWT tokens dynamically for this application.';
        example = 'e.g. 64-char HMAC-SHA256 secret key';
      } else if (k === 'CORS_ALLOWED_ORIGINS' || k === 'corsAllowedOrigins') {
        description = 'Target allowed CORS origins. Injected into Origin headers for OPTIONS and security preflight checks.';
        example = `e.g. ${project.siteUrl},https://localhost:3000`;
      } else if (category === 'auth') {
        description = 'Bearer token or API secret key sent in HTTP Authorization headers.';
        example = 'e.g. Bearer eyJhbGci... or vrt_key_abc123';
      } else if (category === 'ids') {
        description = 'Resource or Entity ID used in URL path parameter lookups (e.g. /users/:id).';
        example = 'e.g. "2" or "usr_84920"';
      } else if (category === 'env') {
        description = 'Target environment URL, protocol, or host domain.';
        example = `e.g. ${project.siteUrl}`;
      } else if (category === 'params') {
        description = 'Query parameter or JSON body payload string.';
        example = 'e.g. "shoes" or "pending"';
      }

      const quality = getFieldQuality(k, val !== undefined ? val : '');

      list.push({
        key: k,
        value: val !== undefined ? val : '',
        category,
        isMissing,
        isSecret,
        usedByCases,
        description,
        example,
        quality,
      });
    });

    return list.sort((a, b) => {
      // Prioritize target application variables at top
      const isTargetAppA = a.key === 'VITE_API_URL' || a.key === 'JWT_SECRET' || a.key === 'CORS_ALLOWED_ORIGINS';
      const isTargetAppB = b.key === 'VITE_API_URL' || b.key === 'JWT_SECRET' || b.key === 'CORS_ALLOWED_ORIGINS';
      if (isTargetAppA && !isTargetAppB) return -1;
      if (!isTargetAppA && isTargetAppB) return 1;

      // Quality issues first
      const hasIssueA = a.quality.status !== 'valid';
      const hasIssueB = b.quality.status !== 'valid';
      if (hasIssueA && !hasIssueB) return -1;
      if (!hasIssueA && hasIssueB) return 1;

      // Missing first, then auth, then ids
      if (a.isMissing && !b.isMissing) return -1;
      if (!a.isMissing && b.isMissing) return 1;
      return a.key.localeCompare(b.key);
    });
  };

  const allVariables = getAllVariables();
  const missingCount = allVariables.filter(v => v.isMissing).length;
  const configuredCount = allVariables.filter(v => !v.isMissing).length;
  const qualityIssuesCount = allVariables.filter(v => v.quality.status !== 'valid').length;
  const totalQualityScore = Math.round(
    allVariables.reduce((acc, v) => acc + v.quality.score, 0) / (allVariables.length || 1)
  );

  // Filtered variables
  const filteredVariables = allVariables.filter(v => {
    if (activeTabFilter === 'issues') return v.quality.status !== 'valid';
    if (activeTabFilter === 'missing') return v.isMissing;
    if (activeTabFilter === 'auth') return v.category === 'auth';
    if (activeTabFilter === 'ids') return v.category === 'ids';
    return true;
  });

  // Handle single variable change in visual mode
  const handleUpdateValue = (key: string, newValue: any) => {
    let updated = setNestedValue(localDataset, key, newValue);
    // Keep dual aliases in sync
    if (key === 'VITE_API_URL') updated.apiUrl = newValue;
    if (key === 'apiUrl') updated.VITE_API_URL = newValue;
    if (key === 'JWT_SECRET') updated.jwtSecret = newValue;
    if (key === 'jwtSecret') updated.JWT_SECRET = newValue;
    if (key === 'CORS_ALLOWED_ORIGINS') updated.corsAllowedOrigins = newValue;
    if (key === 'corsAllowedOrigins') updated.CORS_ALLOWED_ORIGINS = newValue;

    setLocalDataset(updated);
    setRawJsonText(JSON.stringify(updated, null, 2));
  };

  // Helper to update target app execution config directly
  const handleUpdateTargetConfig = (key: 'VITE_API_URL' | 'JWT_SECRET' | 'CORS_ALLOWED_ORIGINS', value: string) => {
    let updated = { ...localDataset, [key]: value };
    if (key === 'VITE_API_URL') updated.apiUrl = value;
    if (key === 'JWT_SECRET') updated.jwtSecret = value;
    if (key === 'CORS_ALLOWED_ORIGINS') updated.corsAllowedOrigins = value;
    setLocalDataset(updated);
    setRawJsonText(JSON.stringify(updated, null, 2));
  };

  // Handle delete variable (CRUD Delete)
  const handleDeleteVariable = async (key: string) => {
    const updated = deleteNestedValue(localDataset, key);
    setLocalDataset(updated);
    setRawJsonText(JSON.stringify(updated, null, 2));
    if (selectedDatasetId) {
      try {
        await datasetService.deleteVariable(selectedDatasetId, key);
      } catch (err) {
        console.warn('Firestore variable deletion notice:', err);
      }
    }
    await onSaveDataset(updated);
  };

  // Auto-fill all missing variables with realistic synthetic mocks
  const handleAutoFillAllMissing = () => {
    let updated = { ...localDataset };
    allVariables.forEach(v => {
      if (v.isMissing) {
        updated = setNestedValue(updated, v.key, generateSyntheticValue(v.key));
      }
    });
    // Ensure target app keys are initialized
    if (!updated.VITE_API_URL) updated.VITE_API_URL = project.siteUrl;
    if (!updated.apiUrl) updated.apiUrl = updated.VITE_API_URL;
    if (!updated.CORS_ALLOWED_ORIGINS) updated.CORS_ALLOWED_ORIGINS = project.siteUrl;
    if (!updated.corsAllowedOrigins) updated.corsAllowedOrigins = updated.CORS_ALLOWED_ORIGINS;

    setLocalDataset(updated);
    setRawJsonText(JSON.stringify(updated, null, 2));
  };

  // Apply a standard preset
  const handleApplyPreset = (presetType: 'rest' | 'ecommerce' | 'auth') => {
    let presetData: Record<string, any> = {};
    if (presetType === 'rest') {
      presetData = {
        VITE_API_URL: project.siteUrl,
        apiUrl: project.siteUrl,
        JWT_SECRET: `sec_rest_jwt_${Math.random().toString(36).substring(2, 12)}`,
        jwtSecret: `sec_rest_jwt_${Math.random().toString(36).substring(2, 12)}`,
        CORS_ALLOWED_ORIGINS: project.siteUrl,
        corsAllowedOrigins: project.siteUrl,
        sample_id: '2',
        page_num: 1,
        search_query: 'active',
        authTokens: {
          user: `mock_jwt_usr_${Math.random().toString(36).substring(2, 8)}`,
          admin: `mock_jwt_adm_${Math.random().toString(36).substring(2, 8)}`,
        },
      };
    } else if (presetType === 'ecommerce') {
      presetData = {
        VITE_API_URL: project.siteUrl,
        apiUrl: project.siteUrl,
        JWT_SECRET: `sec_ecom_jwt_${Math.random().toString(36).substring(2, 12)}`,
        jwtSecret: `sec_ecom_jwt_${Math.random().toString(36).substring(2, 12)}`,
        CORS_ALLOWED_ORIGINS: project.siteUrl,
        corsAllowedOrigins: project.siteUrl,
        sample_id: '101',
        orderId: 'ORD-98421',
        cartId: 'CRT-552',
        currency: 'USD',
        authTokens: {
          user: `mock_cust_token_${Math.random().toString(36).substring(2, 8)}`,
        },
      };
    } else if (presetType === 'auth') {
      presetData = {
        VITE_API_URL: project.siteUrl,
        apiUrl: project.siteUrl,
        JWT_SECRET: `sec_auth_jwt_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`,
        jwtSecret: `sec_auth_jwt_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`,
        CORS_ALLOWED_ORIGINS: `${project.siteUrl},http://localhost:3000`,
        corsAllowedOrigins: `${project.siteUrl},http://localhost:3000`,
        apiKey: `vrt_live_${Math.random().toString(36).substring(2, 12)}`,
        authTokens: {
          user: `mock_user_jwt_${Date.now()}`,
          admin: `mock_admin_jwt_${Date.now()}`,
          guest: 'mock_guest_token',
        },
      };
    }

    // Merge with current
    const merged = { ...localDataset, ...presetData };
    setLocalDataset(merged);
    setRawJsonText(JSON.stringify(merged, null, 2));
  };

  // Add custom variable
  const handleAddCustomVariable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    const cleanKey = newKeyName.trim().replace(/[{}]/g, '');
    const updated = setNestedValue(localDataset, cleanKey, newKeyValue.trim());
    setLocalDataset(updated);
    setRawJsonText(JSON.stringify(updated, null, 2));
    setNewKeyName('');
    setNewKeyValue('');
    setIsAddingVariable(false);
  };

  const handleOpenFieldGuide = (key: string) => {
    setLearningVariableKey(key);
    setIsGuidedLearningOpen(true);
  };

  const handleRunAiAudit = async () => {
    try {
      setAuditLoading(true);
      setIsQualityModalOpen(true);
      let current = localDataset;
      if (editorMode === 'json') {
        try {
          current = JSON.parse(rawJsonText);
        } catch {}
      }
      const res = await api.validateDatasetQuality(project.id, current);
      setAuditResult(res);
    } catch (err) {
      console.error('Failed to run AI audit', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Save changes to backend and Firestore with quality validation enforcement
  const handleSave = async (bypassValidation = false) => {
    if (!bypassValidation) {
      const vars = getAllVariables();
      const hasIssues = vars.some(v => {
        const q = getFieldQuality(v.key, v.value);
        return q.status !== 'valid';
      });

      if (hasIssues) {
        handleRunAiAudit();
        return;
      }
    }

    setIsSaving(true);
    setJsonError(null);
    try {
      let finalDataset = localDataset;
      if (editorMode === 'json') {
        finalDataset = JSON.parse(rawJsonText);
        setLocalDataset(finalDataset);
      }
      if (selectedDatasetId) {
        await datasetService.updateDataset(selectedDatasetId, { variables: finalDataset });
      }
      await onSaveDataset(finalDataset);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setJsonError(err.message || 'Failed to save dataset. Please verify JSON format.');
    } finally {
      setIsSaving(false);
    }
  };

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    navigator.clipboard.writeText(rawJsonText);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Selected test case for Step 4 Resolution Simulation
  const activeSimCase = (testCases || []).find(c => c && c.id === selectedSimCaseId) || testCases?.[0] || null;

  // Resolve template string with current localDataset
  const resolveTemplateString = (input: string): { resolved: string; missingPlaceholders: string[] } => {
    const missing: string[] = [];
    const resolved = input.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, path) => {
      const v = getNestedValue(localDataset, path);
      if (v === undefined || v === null || v === '') {
        missing.push(path);
        return `[MISSING: {{${path}}}]`;
      }
      return String(v);
    });
    return { resolved, missingPlaceholders: missing };
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Success or Error */}
      {saveSuccess && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300 shadow-lg shadow-emerald-950/50">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span>Dataset successfully synchronized and persisted for all test scenarios!</span>
          </div>
          <span className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
            Production Ready
          </span>
        </div>
      )}

      {jsonError && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300">
          <AlertCircle className="h-5 w-5 text-rose-400" />
          <span>{jsonError}</span>
        </div>
      )}

      {/* Firestore Dataset Profile Management Bar (Full CRUD) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-[#1E2235] bg-[#0C0E17] p-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Dataset Profile:</span>
            <select
              value={selectedDatasetId}
              onChange={(e) => handleSwitchDataset(e.target.value)}
              className="rounded-xl border border-[#2A2F45] bg-[#141724] px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {firestoreDatasets.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.environment?.toUpperCase() || 'STAGING'}) {d.isDefault ? '★ Default' : ''}
                </option>
              ))}
              {firestoreDatasets.length === 0 && (
                <option value="">Default Project Environment</option>
              )}
            </select>
          </div>

          {/* Current dataset environment badge */}
          {selectedDatasetId && firestoreDatasets.find(d => d.id === selectedDatasetId) && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Firestore Synced • {firestoreDatasets.find(d => d.id === selectedDatasetId)?.environment?.toUpperCase() || 'STAGING'}
            </span>
          )}
        </div>

        {/* Dataset Profile CRUD Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDatasetFormName('');
              setDatasetFormEnv('staging');
              setDatasetFormDesc('');
              setIsNewDatasetModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition"
            title="Create a new dataset profile in Firestore"
          >
            <FolderPlus className="h-3.5 w-3.5 text-emerald-400" />
            <span>+ New Profile</span>
          </button>

          {selectedDatasetId && (
            <>
              <button
                type="button"
                onClick={() => {
                  const cur = firestoreDatasets.find(d => d.id === selectedDatasetId);
                  if (cur) {
                    setDatasetFormName(cur.name);
                    setDatasetFormEnv(cur.environment || 'staging');
                    setDatasetFormDesc(cur.description || '');
                    setIsEditDatasetModalOpen(true);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl border border-[#2A2F45] bg-[#141724] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1E2235] transition"
                title="Edit dataset name, environment, and metadata in Firestore"
              >
                <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                <span>Edit Profile</span>
              </button>

              {firestoreDatasets.length > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteDataset}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                  title="Delete this dataset profile from Firestore"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  <span>Delete Profile</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Header & Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Dynamic Dataset & Environment Variables</h2>
              <p className="text-xs text-slate-400">
                Configure runtime variables for <span className="font-mono text-emerald-300">{project.siteUrl}</span>. Variables injected into URLs, headers, and request bodies.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Visual vs JSON Toggle */}
          <div className="flex items-center rounded-xl border border-[#1E2235] bg-[#06070B] p-1">
            <button
              onClick={() => {
                if (editorMode === 'json') {
                  try {
                    const parsed = JSON.parse(rawJsonText);
                    setLocalDataset(parsed);
                    setJsonError(null);
                  } catch (e: any) {
                    setJsonError('Please fix JSON syntax errors before switching to visual mode.');
                    return;
                  }
                }
                setEditorMode('visual');
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                editorMode === 'visual'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Visual Guided Form</span>
            </button>
            <button
              onClick={() => {
                setRawJsonText(JSON.stringify(localDataset, null, 2));
                setEditorMode('json');
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                editorMode === 'json'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              <span>Raw JSON Editor</span>
            </button>
          </div>

          {/* Auto-Fill Missing */}
          {missingCount > 0 && (
            <button
              onClick={handleAutoFillAllMissing}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
              title="Automatically fills all missing parameters with realistic synthetic values"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Auto-Fill Missing ({missingCount})</span>
            </button>
          )}

          {/* AI Quality Audit Button */}
          <button
            id="btn-trigger-ai-audit"
            onClick={handleRunAiAudit}
            className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/15 px-3.5 py-2 text-xs font-bold text-purple-300 hover:bg-purple-500/25 transition shadow-sm"
            title="Scan dataset for format errors, token issues, and data quality recommendations"
          >
            <ShieldCheck className="h-4 w-4 text-purple-400" />
            <span>AI Quality Audit ({totalQualityScore}%)</span>
            {qualityIssuesCount > 0 && (
              <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                {qualityIssuesCount}
              </span>
            )}
          </button>

          {/* Guided Tour Button */}
          <button
            id="btn-trigger-guided-tour"
            onClick={() => setIsTourOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3.5 py-2 text-xs font-bold text-blue-300 hover:bg-blue-500/25 transition shadow-sm"
            title="Launch interactive guided tour for dataset management & best practices"
          >
            <BookOpen className="h-3.5 w-3.5 text-blue-400" />
            <span>Guided Tour</span>
          </button>

          {/* Save Button */}
          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-950" />
                <span>Saving Dataset...</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-slate-950" />
                <span>Save Dataset</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Data Quality & Integrity Meter Banner */}
      <div className="rounded-2xl border border-[#1E2235] bg-gradient-to-r from-[#0C0E17] via-[#101424] to-[#0A0D17] p-4 flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border font-black text-base shadow-inner ${
            totalQualityScore >= 90
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : totalQualityScore >= 70
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          }`}>
            {totalQualityScore >= 90 ? 'A' : totalQualityScore >= 75 ? 'B' : totalQualityScore >= 60 ? 'C' : 'D'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Dataset Quality Index: {totalQualityScore}%</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                totalQualityScore >= 90
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {totalQualityScore >= 90 ? 'Verified High Quality' : 'Needs Optimization'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {qualityIssuesCount === 0
                ? 'All variables are correctly formatted, tokenized, and verified for test execution.'
                : `${qualityIssuesCount} variable${qualityIssuesCount > 1 ? 's have' : ' has'} quality notices (e.g. missing Bearer, trailing slashes, or missing values).`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-inspect-quality-audit"
            onClick={handleRunAiAudit}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
            <span>AI Quality Auditor</span>
          </button>
          <button
            id="btn-open-guided-tour"
            onClick={() => setIsTourOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold transition"
          >
            <BookOpen className="h-3.5 w-3.5 text-blue-400" />
            <span>Guided Tour</span>
          </button>
        </div>
      </div>

      {/* 4-Step Visual Workflow Guide */}
      <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A]/90 p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-emerald-400" />
          <span>How Dataset Variables Work in Verity (4 Simple Steps)</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-[11px]">1</span>
              <span>Variable Discovery</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              When test cases run, placeholders like <code className="font-mono text-emerald-300">{`{{authTokens.user}}`}</code> or <code className="font-mono text-emerald-300">{`{{sample_id}}`}</code> are automatically extracted.
            </p>
          </div>

          <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 text-[11px]">2</span>
              <span>Provide Values</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              Enter real API tokens/secrets or click <strong>"Auto-Generate Mock"</strong> to inject realistic synthetic test data without manual work.
            </p>
          </div>

          <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[11px]">3</span>
              <span>Simulation Check</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              Use the Live Resolution Simulator below to inspect the compiled HTTP request and verify all tokens & paths match expected API formats.
            </p>
          </div>

          <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-[11px]">4</span>
              <span>Run Production Ready</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
              Click <strong>Run Preview</strong> or <strong>Cloud Run</strong>. The test runner substitutes variables seamlessly with zero interactive stops!
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {editorMode === 'visual' ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Visual Form Variables List (8 cols) */}
          <div className="lg:col-span-8 space-y-5">
            {/* Dedicated Target Application Host, Auth & CORS Configuration Card */}
            <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-[#0F111A] via-[#101422] to-[#0A0D15] p-5 shadow-xl space-y-4 ring-1 ring-emerald-500/20">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2235] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Target Application Host & Security Configuration</span>
                      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
                        Per-Application
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Configures target-specific backend routing, dynamic JWT signing, and CORS origins for this website.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                    Profile: {firestoreDatasets.find(d => d.id === selectedDatasetId)?.name || 'Default'}
                  </span>
                </div>
              </div>

              {/* 3 Prominent Target Inputs */}
              <div className="space-y-4">
                {/* 1. Target API URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Target Backend API URL</span>
                      <code className="font-mono text-[11px] text-cyan-300 ml-1">VITE_API_URL</code>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenFieldGuide('VITE_API_URL')}
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>How To Get</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTargetConfig('VITE_API_URL', project.siteUrl)}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 transition"
                      >
                        Use Site URL ({project.siteUrl})
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Directs API test requests to this backend host when backend and frontend are deployed on separate URLs or subdomains.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      value={localDataset.VITE_API_URL || localDataset.apiUrl || ''}
                      onChange={(e) => handleUpdateTargetConfig('VITE_API_URL', e.target.value)}
                      placeholder={`e.g. ${project.siteUrl} or https://api.${project.siteUrl.replace(/^https?:\/\//, '')}`}
                      className="w-full rounded-xl border border-[#2A2F45] bg-[#06070B] px-3.5 py-2 text-xs font-mono text-cyan-300 placeholder-slate-600 focus:border-cyan-400 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* 2. Target JWT Signing Secret */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-purple-400" />
                      <span>Target Application JWT Signing Secret</span>
                      <code className="font-mono text-[11px] text-purple-300 ml-1">JWT_SECRET</code>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenFieldGuide('JWT_SECRET')}
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>How To Get</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTargetConfig('JWT_SECRET', `sec_jwt_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 12)}`)}
                        className="text-[11px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Generate Secret</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Signing key for this target application. When set, Verity's test runner dynamically signs authentic JWT bearer tokens on-the-fly for your test cases.
                  </p>
                  <div className="relative flex items-center">
                    <input
                      type={revealedSecrets['JWT_SECRET'] ? 'text' : 'password'}
                      value={localDataset.JWT_SECRET || localDataset.jwtSecret || ''}
                      onChange={(e) => handleUpdateTargetConfig('JWT_SECRET', e.target.value)}
                      placeholder="e.g. your_target_app_jwt_secret_64chars (optional for public endpoints)"
                      className="w-full rounded-xl border border-[#2A2F45] bg-[#06070B] px-3.5 py-2 pr-10 text-xs font-mono text-purple-300 placeholder-slate-600 focus:border-purple-400 focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealedSecrets(prev => ({ ...prev, JWT_SECRET: !prev['JWT_SECRET'] }))}
                      className="absolute right-3 text-slate-400 hover:text-white transition"
                    >
                      {revealedSecrets['JWT_SECRET'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* 3. Target Allowed CORS Origins */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Target Allowed CORS Origins</span>
                      <code className="font-mono text-[11px] text-emerald-300 ml-1">CORS_ALLOWED_ORIGINS</code>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenFieldGuide('CORS_ALLOWED_ORIGINS')}
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>How To Get</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTargetConfig('CORS_ALLOWED_ORIGINS', `${project.siteUrl},http://localhost:3000`)}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 transition"
                      >
                        Use Standard Origins
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Comma-separated list of allowed origins. Injected into preflight OPTIONS and CORS security assertion test scenarios.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      value={localDataset.CORS_ALLOWED_ORIGINS || localDataset.corsAllowedOrigins || ''}
                      onChange={(e) => handleUpdateTargetConfig('CORS_ALLOWED_ORIGINS', e.target.value)}
                      placeholder={`e.g. ${project.siteUrl},https://localhost:3000`}
                      className="w-full rounded-xl border border-[#2A2F45] bg-[#06070B] px-3.5 py-2 text-xs font-mono text-emerald-300 placeholder-slate-600 focus:border-emerald-400 focus:outline-none transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Tabs & Quick Add */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2235] pb-3">
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: `All Variables (${allVariables.length})` },
                  { id: 'issues', label: `Needs Attention (${qualityIssuesCount})` },
                  { id: 'missing', label: `Needs Value (${missingCount})` },
                  { id: 'auth', label: 'Auth & Secrets' },
                  { id: 'ids', label: 'IDs & Slugs' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabFilter(tab.id as any)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      activeTabFilter === tab.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingVariable(!isAddingVariable)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B]"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Add Variable</span>
                </button>
              </div>
            </div>

            {/* Quick Add Form Drawer */}
            {isAddingVariable && (
              <form onSubmit={handleAddCustomVariable} className="rounded-xl border border-emerald-500/30 bg-[#0E1019] p-4 space-y-3">
                <div className="text-xs font-bold text-white">Add New Dataset Variable</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">Variable Key (e.g. sample_id, authTokens.user)</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. authTokens.admin"
                      required
                      className="mt-1 w-full rounded-lg border border-[#1E2235] bg-[#06070B] px-3 py-2 font-mono text-xs text-emerald-300 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400">Initial Value</label>
                    <input
                      type="text"
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      placeholder="e.g. secret_token_xyz"
                      className="mt-1 w-full rounded-lg border border-[#1E2235] bg-[#06070B] px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingVariable(false)}
                    className="rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1A1D2B]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    Save Variable
                  </button>
                </div>
              </form>
            )}

            {/* Variable Cards List */}
            <div className="space-y-3">
              {filteredVariables.length > 0 ? (
                filteredVariables.map((v) => {
                  const isMasked = v.isSecret && !revealedSecrets[v.key];
                  return (
                    <div
                      key={v.key}
                      className={`rounded-2xl border p-4 transition ${
                        v.isMissing
                          ? 'border-rose-500/40 bg-rose-950/10'
                          : v.quality.status === 'warning'
                          ? 'border-amber-500/30 bg-[#0F111A]'
                          : 'border-[#1E2235] bg-[#0F111A] hover:border-[#2D334D]'
                      }`}
                    >
                      {/* Top Row: Key Name, Category, Status Badge, and Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-[#1A1D2B] px-2 py-0.5 font-mono text-xs font-bold text-emerald-300 border border-[#1E2235]">
                            {`{{${v.key}}}`}
                          </code>

                          {/* Category Badge */}
                          <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            v.category === 'auth' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                            v.category === 'ids' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            v.category === 'env' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                            'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                          }`}>
                            {v.category === 'auth' && <Key className="h-3 w-3" />}
                            {v.category === 'ids' && <Hash className="h-3 w-3" />}
                            {v.category === 'env' && <Globe className="h-3 w-3" />}
                            {v.category}
                          </span>

                          {/* Data Quality & Integrity Badge */}
                          {v.quality.status === 'valid' ? (
                            <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" />
                              Valid Format
                            </span>
                          ) : v.quality.status === 'warning' ? (
                            <span className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                              <AlertTriangle className="h-3 w-3" />
                              {v.quality.issue || 'Quality Notice'}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                              <AlertCircle className="h-3 w-3" />
                              {v.quality.issue || 'Format Error'}
                            </span>
                          )}
                        </div>

                        {/* Action Buttons: Auto-Fix, How To Get, Generate Mock, Delete */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Guided Learning Button */}
                          <button
                            type="button"
                            id={`btn-guide-${v.key}`}
                            onClick={() => handleOpenFieldGuide(v.key)}
                            className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2.5 py-1 rounded-lg transition"
                            title="Interactive visual steps and screenshots on how to obtain this data"
                          >
                            <BookOpen className="h-3 w-3" />
                            <span>How To Get</span>
                          </button>

                          {/* Auto-Fix Format if available */}
                          {v.quality.autoFix && (
                            <button
                              type="button"
                              onClick={() => handleUpdateValue(v.key, v.quality.autoFix)}
                              className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-2.5 py-1 rounded-lg transition"
                              title={`Auto-Fix value to: ${v.quality.autoFix}`}
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>Auto-Fix Format</span>
                            </button>
                          )}

                          {/* Quick Generate Mock Value */}
                          <button
                            type="button"
                            onClick={() => handleUpdateValue(v.key, generateSyntheticValue(v.key))}
                            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-lg"
                            title="Generate realistic mock data"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>Mock</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteVariable(v.key)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                            title="Delete variable"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Explanation & Used By */}
                      <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                        <span>{v.description}</span>
                        {v.usedByCases.length > 0 && (
                          <span className="text-slate-400">
                            Required in <strong className="text-white">{v.usedByCases.length}</strong> test case{v.usedByCases.length > 1 ? 's' : ''}:{' '}
                            <span className="font-mono text-emerald-400">
                              {v.usedByCases.slice(0, 3).map(c => c.extId).join(', ')}
                              {v.usedByCases.length > 3 ? ` +${v.usedByCases.length - 3} more` : ''}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Input Field */}
                      <div className="mt-3 relative flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={isMasked ? 'password' : 'text'}
                            value={v.value}
                            onChange={(e) => handleUpdateValue(v.key, e.target.value)}
                            placeholder={v.example}
                            className={`w-full rounded-xl border bg-[#06070B] px-3.5 py-2 font-mono text-xs text-white placeholder-slate-600 focus:outline-none transition ${
                              v.isMissing
                                ? 'border-rose-500/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30'
                                : 'border-[#1E2235] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
                            }`}
                          />

                          {v.isSecret && (
                            <button
                              type="button"
                              onClick={() => setRevealedSecrets(prev => ({ ...prev, [v.key]: !prev[v.key] }))}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                              title={isMasked ? 'Reveal secret' : 'Hide secret'}
                            >
                              {isMasked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-8 text-center text-slate-400">
                  No variables found for this filter tab.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Presets & Live Resolution Simulator (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Quick Preset Packs */}
            <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span>One-Click Dataset Presets</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Instantly populate your project with standardized test fixtures.
              </p>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('rest')}
                  className="flex w-full items-start gap-2.5 rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-left transition hover:border-emerald-500/40 hover:bg-[#131622]"
                >
                  <div className="rounded bg-emerald-500/20 p-1 text-emerald-400">
                    <Globe className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Standard REST API Preset</div>
                    <div className="text-[10px] text-slate-400">IDs, search query, Bearer user & admin tokens</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('ecommerce')}
                  className="flex w-full items-start gap-2.5 rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-left transition hover:border-emerald-500/40 hover:bg-[#131622]"
                >
                  <div className="rounded bg-amber-500/20 p-1 text-amber-400">
                    <Hash className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">E-Commerce & Orders Preset</div>
                    <div className="text-[10px] text-slate-400">Cart IDs, customer tokens, order references</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('auth')}
                  className="flex w-full items-start gap-2.5 rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-left transition hover:border-emerald-500/40 hover:bg-[#131622]"
                >
                  <div className="rounded bg-purple-500/20 p-1 text-purple-400">
                    <Key className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Auth & RBAC Security Preset</div>
                    <div className="text-[10px] text-slate-400">API keys, multi-role tokens (user/admin/guest)</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Live Request Resolution Simulator */}
            <div className="rounded-2xl border border-emerald-500/30 bg-[#0F111A] p-5 space-y-3 ring-1 ring-emerald-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  <span>Live Resolution Simulator</span>
                </div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  Step 3 Validation
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Select a test scenario to inspect how variables are substituted into real production requests.
              </p>

              {testCases.length > 0 ? (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400">Select Test Scenario:</label>
                  <select
                    value={selectedSimCaseId}
                    onChange={(e) => setSelectedSimCaseId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {testCases.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.extId}: {c.title.slice(0, 38)}...
                      </option>
                    ))}
                  </select>

                  {activeSimCase && activeSimCase.spec.requests?.[0] && (
                    <div className="mt-3 space-y-2 font-mono text-[11px]">
                      {/* Before: Raw Template */}
                      <div className="rounded-xl border border-[#1E2235] bg-[#06070B] p-3">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          1. Raw Test Template
                        </div>
                        <div className="text-emerald-400 font-bold">
                          {activeSimCase.spec.requests[0].method || 'GET'} {activeSimCase.spec.requests[0].path}
                        </div>
                        {activeSimCase.spec.requests[0].headers && (
                          <div className="mt-1 text-slate-400 text-[10px]">
                            Headers: {JSON.stringify(activeSimCase.spec.requests[0].headers)}
                          </div>
                        )}
                      </div>

                      {/* After: Resolved Output */}
                      {(() => {
                        const pathSim = resolveTemplateString(activeSimCase.spec.requests[0].path);
                        const isAllResolved = pathSim.missingPlaceholders.length === 0;
                        return (
                          <div className={`rounded-xl border p-3 ${
                            isAllResolved ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-amber-500/40 bg-amber-950/20'
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                2. Resolved Production Call
                              </span>
                              {isAllResolved ? (
                                <span className="text-emerald-400 text-[10px] font-bold">✓ 100% Resolved</span>
                              ) : (
                                <span className="text-amber-400 text-[10px] font-bold">⚠ Needs {pathSim.missingPlaceholders.length} field(s)</span>
                              )}
                            </div>
                            {(() => {
                              const targetBase = (localDataset.VITE_API_URL || localDataset.apiUrl || project.siteUrl || '').replace(/\/$/, '');
                              const hasCustomApi = Boolean(localDataset.VITE_API_URL || localDataset.apiUrl);
                              return (
                                <div className="space-y-1">
                                  <div className="text-white font-bold break-all">
                                    {activeSimCase.spec.requests[0].method || 'GET'}{' '}
                                    {targetBase}/{pathSim.resolved.replace(/^\//, '')}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-slate-400">
                                    <span>Target Base: <span className="font-mono text-cyan-300">{targetBase}</span></span>
                                    {hasCustomApi && (
                                      <span className="rounded bg-cyan-500/20 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300 border border-cyan-500/30">
                                        Custom VITE_API_URL
                                      </span>
                                    )}
                                    {(localDataset.JWT_SECRET || localDataset.jwtSecret) && (
                                      <span className="rounded bg-purple-500/20 px-1.5 py-0.2 text-[9px] font-bold text-purple-300 border border-purple-500/30">
                                        JWT_SECRET Active
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic py-2">
                  No test scenarios created yet. Generate test cases in the "Test Generator" tab first.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* JSON Mode */
        <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E2235] pb-4">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5 text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-white">Direct JSON Specification Editor</h3>
                <p className="text-xs text-slate-400">
                  Advanced developers can edit, format, or paste nested JSON data structures directly.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-[#1A1D2B]"
              >
                {copiedJson ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <textarea
            value={rawJsonText}
            onChange={(e) => {
              setRawJsonText(e.target.value);
              try {
                const parsed = JSON.parse(e.target.value);
                setLocalDataset(parsed);
                setJsonError(null);
              } catch (err: any) {
                setJsonError(`JSON Syntax: ${err.message}`);
              }
            }}
            rows={20}
            className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none leading-relaxed"
          />
        </div>
      )}

      {/* Modal: Create New Dataset Profile */}
      {isNewDatasetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Create Dataset Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewDatasetModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-[#1E2235] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewDataset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staging Environment, Production Canary"
                  value={datasetFormName}
                  onChange={e => setDatasetFormName(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Environment
                </label>
                <select
                  value={datasetFormEnv}
                  onChange={e => setDatasetFormEnv(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="staging">Staging (QA)</option>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                  <option value="development">Development / Local</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Variables and authorization keys for this environment..."
                  value={datasetFormDesc}
                  onChange={e => setDatasetFormDesc(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cloneVars"
                  checked={cloneCurrentVars}
                  onChange={e => setCloneCurrentVars(e.target.checked)}
                  className="rounded border-[#1E2235] bg-[#06070B] text-emerald-500 focus:ring-0"
                />
                <label htmlFor="cloneVars" className="text-xs text-slate-300 cursor-pointer">
                  Clone variables from currently active dataset
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setIsNewDatasetModalOpen(false)}
                  className="rounded-xl border border-[#1E2235] bg-[#141724] px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !datasetFormName.trim()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Create in Firestore</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Dataset Profile */}
      {isEditDatasetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Edit Dataset Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDatasetModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-[#1E2235] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateDatasetMeta} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  required
                  value={datasetFormName}
                  onChange={e => setDatasetFormName(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Environment
                </label>
                <select
                  value={datasetFormEnv}
                  onChange={e => setDatasetFormEnv(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="staging">Staging (QA)</option>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                  <option value="development">Development / Local</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={datasetFormDesc}
                  onChange={e => setDatasetFormDesc(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setIsEditDatasetModalOpen(false)}
                  className="rounded-xl border border-[#1E2235] bg-[#141724] px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !datasetFormName.trim()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText={confirmModalState.confirmText}
        variant={confirmModalState.variant}
        onConfirm={confirmModalState.onConfirm}
        onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* In-App Alert Modal */}
      <AlertModal
        isOpen={alertModalState.isOpen}
        title={alertModalState.title}
        message={alertModalState.message}
        type={alertModalState.type}
        onClose={() => setAlertModalState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Guided Learning Modal with Screenshots & Steps */}
      <DatasetGuidedLearningModal
        isOpen={isGuidedLearningOpen}
        onClose={() => setIsGuidedLearningOpen(false)}
        projectId={project.id}
        variableKey={learningVariableKey}
        currentValue={getNestedValue(localDataset, learningVariableKey)}
        siteUrl={project.siteUrl}
        onApplyValue={(keyOrVal, maybeVal) => {
          if (maybeVal !== undefined) {
            handleUpdateValue(keyOrVal, maybeVal);
          } else {
            handleUpdateValue(learningVariableKey, keyOrVal);
          }
          setIsGuidedLearningOpen(false);
        }}
      />

      {/* Dataset Quality & AI Audit Modal */}
      <DatasetQualityModal
        isOpen={isQualityModalOpen}
        onClose={() => setIsQualityModalOpen(false)}
        auditResult={auditResult}
        loading={auditLoading}
        onRefreshAudit={handleRunAiAudit}
        onAutoFixAll={(fixedDataset) => {
          setLocalDataset(fixedDataset);
          setRawJsonText(JSON.stringify(fixedDataset, null, 2));
        }}
        onOpenFieldGuide={(key) => {
          setIsQualityModalOpen(false);
          handleOpenFieldGuide(key);
        }}
        onConfirmSave={() => {
          handleSave(true);
        }}
        dataset={localDataset}
      />

      {/* Interactive Guided Tour */}
      <DatasetGuidedTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onComplete={() => setIsTourOpen(false)}
      />
    </div>
  );
};
