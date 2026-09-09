import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Download,
  Plus,
  Sparkles,
  Upload,
  Database,
  FileCode,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Layers,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Zap,
  Cloud,
  Code2,
  Sliders,
  Globe,
  Wand2,
  Shield,
  Activity,
  ArrowRight,
  TrendingUp,
  Tag,
  Eye,
  Server,
  Terminal,
  HelpCircle,
  Edit3,
  X,
  Menu,
  Check,
  CheckSquare,
  Minus
} from 'lucide-react';
import { api, UrlAnalysisResult, getStoredToken } from '../services/api';
import { projectService, testCaseService, testRunService, signInWithGoogle, auth } from '../services/firebase';
import { Project, TestCase, TestRun, User, Organization, Suite, TestSchedule } from '../types';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { InteractiveDataModal } from './InteractiveDataModal';
import { CloudDeployModal } from './CloudDeployModal';
import { TestDetailDrawer } from './TestDetailDrawer';
import { DatasetConfigurator } from './DatasetConfigurator';
import { BatchExecutionModal } from './BatchExecutionModal';
import { ConfirmModal } from './ConfirmModal';
import { AlertModal } from './AlertModal';
import { IntrospectionJourneyModal } from './IntrospectionJourneyModal';
import { TestSchedulerTab } from './TestSchedulerTab';

interface ProjectStudioProps {
  currentUser: User | null;
  currentOrg: Organization | null;
  onOpenBilling: () => void;
  onOpenAuth?: (mode: 'login' | 'register') => void;
  onSwitchPersona?: (role?: string, email?: string) => void;
}

export const ProjectStudio: React.FC<ProjectStudioProps> = ({
  currentUser,
  currentOrg,
  onOpenBilling,
  onOpenAuth,
  onSwitchPersona,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);

  const [cases, setCases] = useState<TestCase[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [schedules, setSchedules] = useState<TestSchedule[]>([]);
  const [dataset, setDataset] = useState<Record<string, any>>({});
  const [missingProjectFields, setMissingProjectFields] = useState<string[]>([]);
  const [allNeededFields, setAllNeededFields] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);

  // Bulk action selection & execution states
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [isBulkRunning, setIsBulkRunning] = useState<boolean>(false);
  const [bulkRunningMode, setBulkRunningMode] = useState<'preview' | 'hosted' | null>(null);

  // Active view tab inside Studio
  const [activeTab, setActiveTab] = useState<'cases' | 'analytics' | 'ingest' | 'dataset' | 'schedules' | 'deploy'>('cases');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Modals & Drawers
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjUrl, setNewProjUrl] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');

  // Project Edit CRUD state
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editProjName, setEditProjName] = useState('');
  const [editProjUrl, setEditProjUrl] = useState('');
  const [editProjDesc, setEditProjDesc] = useState('');

  // Test Case CRUD state (Create, Edit, Delete)
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [isEditCaseModalOpen, setIsEditCaseModalOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [caseFormTitle, setCaseFormTitle] = useState('');
  const [caseFormCategory, setCaseFormCategory] = useState('API Endpoints');
  const [caseFormPriority, setCaseFormPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [caseFormType, setCaseFormType] = useState<'http' | 'load' | 'manual'>('http');
  const [caseFormMethod, setCaseFormMethod] = useState('GET');
  const [caseFormPath, setCaseFormPath] = useState('/');
  const [caseFormExpectedStatus, setCaseFormExpectedStatus] = useState('200');
  const [caseFormTags, setCaseFormTags] = useState('custom, api');

  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [selectedDrawerCase, setSelectedDrawerCase] = useState<TestCase | null>(null);

  // Production Batch Execution Modal State
  const [batchModalState, setBatchModalState] = useState<{
    isOpen: boolean;
    mode: 'preview' | 'hosted';
  }>({
    isOpen: false,
    mode: 'preview',
  });

  // Interactive Missing Data Prompt
  const [interactivePrompt, setInteractivePrompt] = useState<{
    isOpen: boolean;
    missingField: string;
    testCase: TestCase | null;
    targetMode: 'preview' | 'hosted';
  }>({
    isOpen: false,
    missingField: '',
    testCase: null,
    targetMode: 'preview',
  });

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

  // Interactive URL Introspection Journey Modal state
  const [isJourneyModalOpen, setIsJourneyModalOpen] = useState(false);
  const [journeyModalInitialUrl, setJourneyModalInitialUrl] = useState('https://ai.whyor.in');

  // Ingest state
  const [ingestMode, setIngestMode] = useState<'ai' | 'upload_json' | 'upload_csv' | 'upload_md'>('ai');
  const [generatorUrl, setGeneratorUrl] = useState('');
  const [urlAnalysis, setUrlAnalysis] = useState<UrlAnalysisResult | null>(null);
  const [isAnalyzingUrl, setIsAnalyzingUrl] = useState(false);
  const [autoFillEnabled, setAutoFillEnabled] = useState(true);
  const [userPromptHint, setUserPromptHint] = useState('');
  const [appliedArchetype, setAppliedArchetype] = useState<string | null>(null);
  const [isAnalyzingProjUrl, setIsAnalyzingProjUrl] = useState(false);
  const lastAnalyzedUrlRef = useRef<string>('');

  const [aiPromptDesc, setAiPromptDesc] = useState('');
  const [aiExistingPlan, setAiExistingPlan] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadSuiteName, setUploadSuiteName] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isBrowserGenerating, setIsBrowserGenerating] = useState(false);
  const [browserGenResult, setBrowserGenResult] = useState<{
    caseCount: number;
    pagesCrawled: number;
    totalUrlsDiscovered: number;
    usedSitemap: boolean;
    interactiveControlsFound: number;
    casesNeedingUserData: Array<{ id: string; title: string; dataFields: string[] }>;
  } | null>(null);

  // Dataset JSON editor
  const [rawDatasetText, setRawDatasetText] = useState('');
  const [datasetSaveSuccess, setDatasetSaveSuccess] = useState(false);

  // 1. Initial Load of Projects (with Firestore Realtime Sync)
  const loadProjects = async () => {
    if (!currentUser) {
      setProjects([]);
      setSelectedProjectId(null);
      setProjectData(null);
      setCases([]);
      setSuites([]);
      setSchedules([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await api.getProjects();
      const validList = Array.isArray(list) ? list.filter(p => p && p.id) : [];
      setProjects(validList);
      if (validList.length > 0) {
        if (!selectedProjectId || !validList.some(p => p?.id === selectedProjectId)) {
          setSelectedProjectId(validList[0].id);
        }
      } else {
        setSelectedProjectId(null);
        setProjectData(null);
        setCases([]);
        setSuites([]);
        setSchedules([]);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      setProjects([]);
      setSelectedProjectId(null);
      setProjectData(null);
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setProjects([]);
      setSelectedProjectId(null);
      setProjectData(null);
      setCases([]);
      setSuites([]);
      setSchedules([]);
      setLoading(false);
      return;
    }

    loadProjects();

    // Subscribe to Firestore Projects collection in real time with user security scoping
    const unsubscribe = projectService.subscribeProjects(currentUser, (firestoreProjects) => {
      const validProjects = Array.isArray(firestoreProjects) ? firestoreProjects.filter(p => p && p.id) : [];
      if (validProjects.length > 0) {
        setProjects(validProjects);
        if (!selectedProjectId || !validProjects.some(p => p?.id === selectedProjectId)) {
          setSelectedProjectId(validProjects[0].id);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.role, currentUser?.orgId]);

  // Subscribe to real-time Test Cases from Firestore for selected project
  useEffect(() => {
    if (!selectedProjectId || !currentUser) {
      setCases([]);
      return;
    }
    const unsubscribe = testCaseService.subscribeTestCases(selectedProjectId, currentUser, (firestoreCases) => {
      if (firestoreCases && firestoreCases.length > 0) {
        setCases(firestoreCases);
      }
    });
    return () => unsubscribe();
  }, [selectedProjectId, currentUser?.id]);

  // 2. Load Selected Project Cases & Dataset
  const loadSelectedProject = async (id: string) => {
    if (!currentUser || !id) {
      setProjectData(null);
      setCases([]);
      return;
    }
    try {
      const [proj, casesResp] = await Promise.all([
        api.getProject(id),
        api.getProjectCases(id).catch(err => {
          console.warn('API getProjectCases error:', err);
          return {
            cases: [],
            suites: [],
            dataset: {},
            allNeededFields: [],
            missingProjectFields: [],
          };
        }),
      ]);
      setProjectData(proj);
      setCases(casesResp.cases || []);
      if (casesResp.suites && casesResp.suites.length > 0) {
        setSuites(casesResp.suites);
      } else {
        api.getSuites(id).then(setSuites).catch(() => {});
      }
      api.getSchedules(id).then(setSchedules).catch(() => {});
      if (casesResp.dataset) {
        setDataset(casesResp.dataset);
        setRawDatasetText(JSON.stringify(casesResp.dataset, null, 2));
      }
      setMissingProjectFields(casesResp.missingProjectFields || []);
      setAllNeededFields(casesResp.allNeededFields || []);
      if (proj.siteUrl) {
        setGeneratorUrl(proj.siteUrl);
      }
    } catch (err: any) {
      console.error('Failed to load project details:', err);
      if (err?.status === 403 || err?.status === 404) {
        setProjectData(null);
        setCases([]);
        setSuites([]);
        setSchedules([]);
      }
    }
  };

  useEffect(() => {
    setSelectedCaseIds([]);
    if (selectedProjectId) {
      loadSelectedProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Dynamic URL analysis for Test Case Generation
  const triggerUrlAnalysis = async (
    targetUrlToAnalyze: string,
    hint?: string,
    forceApply = false
  ) => {
    const cleanUrl = targetUrlToAnalyze.trim();
    if (!cleanUrl || cleanUrl.length < 4) return;
    const cacheKey = `${cleanUrl}::${hint !== undefined ? hint : userPromptHint}`;
    if (!forceApply && urlAnalysis && lastAnalyzedUrlRef.current === cacheKey) {
      return;
    }
    lastAnalyzedUrlRef.current = cacheKey;

    setIsAnalyzingUrl(true);
    try {
      const result = await api.analyzeUrl(cleanUrl, hint !== undefined ? hint : userPromptHint, selectedProjectId || undefined);
      setUrlAnalysis(result);

      if (autoFillEnabled || forceApply) {
        if (result.suggestedSuiteName && (!uploadSuiteName || forceApply || uploadSuiteName.startsWith('AI Generated Suite'))) {
          setUploadSuiteName(result.suggestedSuiteName);
        }
        if (result.description && (!aiPromptDesc || forceApply)) {
          setAiPromptDesc(result.description);
        }
        if (result.suggestedOpenApiDoc && (!aiExistingPlan || forceApply)) {
          setAiExistingPlan(result.suggestedOpenApiDoc);
        }
      }
    } catch {
      // Graceful fallback is provided by the service
    } finally {
      setIsAnalyzingUrl(false);
    }
  };

  // Debounced URL and user hint watcher
  useEffect(() => {
    if (activeTab !== 'ingest' || ingestMode !== 'ai') return;
    if (!generatorUrl.trim() || generatorUrl.length < 5) return;

    const timer = setTimeout(() => {
      triggerUrlAnalysis(generatorUrl, userPromptHint, false);
    }, 800);

    return () => clearTimeout(timer);
  }, [generatorUrl, userPromptHint, activeTab, ingestMode]);

  // Initial trigger when selected project loads
  useEffect(() => {
    if (projectData?.siteUrl) {
      setGeneratorUrl(projectData.siteUrl);
      if (!urlAnalysis) {
        triggerUrlAnalysis(projectData.siteUrl, '', true);
      }
    }
  }, [projectData?.id]);

  // Quick Auto-Fill Helpers
  const handleAutoFillAll = () => {
    if (!urlAnalysis) {
      triggerUrlAnalysis(generatorUrl, userPromptHint, true);
      return;
    }
    setUploadSuiteName(urlAnalysis.suggestedSuiteName);
    setAiPromptDesc(urlAnalysis.description);
    if (urlAnalysis.suggestedOpenApiDoc) {
      setAiExistingPlan(urlAnalysis.suggestedOpenApiDoc);
    }
    setAppliedArchetype('all');
  };

  const handleApplyArchetype = (archetype: 'security' | 'load' | 'crud' | 'validation') => {
    setAppliedArchetype(archetype);
    const domain = generatorUrl ? generatorUrl.replace(/^https?:\/\//, '').split('/')[0] : 'Target';

    if (archetype === 'security') {
      setUploadSuiteName(`${domain} Auth & RBAC Security Suite`);
      const secDesc = `High-priority security test suite verifying JWT/Bearer token authorization with {{authTokens.user}}, ensuring unauthenticated requests are rejected (401 Unauthorized), admin paths enforce RBAC roles (403 Forbidden), and security headers (CORS, HSTS) are strictly verified.`;
      setAiPromptDesc(prev => (prev.trim() ? `${prev}\n\n${secDesc}` : secDesc));
    } else if (archetype === 'load') {
      setUploadSuiteName(`${domain} Concurrency & Latency Stress Suite`);
      const loadDesc = `Performance & burst load test suite benchmarking p95 latency under 500ms across 10 concurrent virtual clients. Verifies server throughput, connection pooling, and absence of 502/504 gateway timeouts under burst spikes.`;
      setAiPromptDesc(prev => (prev.trim() ? `${prev}\n\n${loadDesc}` : loadDesc));
    } else if (archetype === 'crud') {
      setUploadSuiteName(`${domain} Parameterized CRUD Lifecycle Suite`);
      const crudDesc = `Comprehensive resource lifecycle test verifying creation (POST) status 201, parameterized retrieval (GET) with dynamic variable {{sample_id}}, state mutation (PUT/PATCH), and cleanup (DELETE 204), with body payload assertions.`;
      setAiPromptDesc(prev => (prev.trim() ? `${prev}\n\n${crudDesc}` : crudDesc));
    } else if (archetype === 'validation') {
      setUploadSuiteName(`${domain} Negative Testing & 422 Edge Case Suite`);
      const valDesc = `Negative testing and schema boundary test suite. Injects malformed JSON bodies, missing required parameters, and invalid data types to assert proper 400 Bad Request or 422 Unprocessable Entity responses without 500 crashes.`;
      setAiPromptDesc(prev => (prev.trim() ? `${prev}\n\n${valDesc}` : valDesc));
    }
  };

  const handleInsertScenario = (scenario: string) => {
    setAiPromptDesc(prev => {
      const addition = `\n- Verify scenario: ${scenario}`;
      return prev ? `${prev}${addition}` : addition.trim();
    });
  };

  const handleInsertVariable = (variable: string) => {
    setAiPromptDesc(prev => {
      const placeholder = `{{${variable}}}`;
      return prev ? `${prev} ${placeholder}` : placeholder;
    });
  };

  const handleInsertFocusArea = (area: string) => {
    setAiPromptDesc(prev => {
      const addition = ` Focus on ${area}.`;
      return prev ? `${prev}${addition}` : addition.trim();
    });
  };

  // 3. Create Project (Firestore + Backend)
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim() || !newProjUrl.trim()) return;

    if (!currentUser) {
      showAlert('Please sign in before creating a project.', 'Authentication Required', 'info');
      setIsNewProjectModalOpen(false);
      onOpenAuth?.('login');
      return;
    }

    setIsCreatingProject(true);
    try {
      // Ensure backend session token is valid for Google / Firebase authenticated users
      await api.ensureValidSession();

      const created = await api.createProject(newProjName.trim(), newProjUrl.trim(), newProjDesc.trim());
      const effectiveCreatedId = created?.id || `proj_${Date.now()}`;
      try {
        await projectService.createProject({
          id: effectiveCreatedId,
          name: created?.name || newProjName.trim(),
          siteUrl: created?.siteUrl || newProjUrl.trim(),
          description: created?.description || newProjDesc.trim(),
          ownerUserId: currentUser?.id || auth.currentUser?.uid || 'user',
          orgId: currentOrg?.id || null,
          dataset: created?.dataset || { baseUrl: created?.siteUrl || newProjUrl.trim() },
        });
      } catch (fErr) {
        console.warn('Firestore project create sync note:', fErr);
      }

      setIsNewProjectModalOpen(false);
      setNewProjName('');
      setNewProjUrl('');
      setNewProjDesc('');
      await loadProjects();
      setSelectedProjectId(effectiveCreatedId);
    } catch (err: any) {
      if (err?.status === 401 || err?.message?.includes('authentication token') || err?.message?.includes('Authentication required')) {
        showAlert('Your session has expired or requires sign-in. Please sign in to create and manage test projects.', 'Authentication Required', 'info');
      } else {
        showAlert(err.message || 'Failed to create project.');
      }
    } finally {
      setIsCreatingProject(false);
    }
  };

  // 3a-2. Complete Introspection Journey Handler
  const handleJourneySuccess = async (result: any) => {
    try {
      await loadProjects();
      if (result.projectId) {
        setSelectedProjectId(result.projectId);
        await loadSelectedProject(result.projectId);
      }
      setActiveTab('cases');
      showAlert(
        `Successfully formed ${result.caseCount} test cases and dynamic dataset for "${result.suiteName}". Zero missing parameter placeholders.`,
        'Journey Complete',
        'success'
      );
    } catch (err: any) {
      console.error('Failed to switch to newly built suite:', err);
    }
  };

  // 3b. Update Project Details (CRUD Update)
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !editProjName.trim() || !editProjUrl.trim()) return;
    try {
      const updated = await api.updateProject(selectedProjectId, {
        name: editProjName.trim(),
        siteUrl: editProjUrl.trim(),
        description: editProjDesc.trim(),
      });
      try {
        await projectService.updateProject(selectedProjectId, {
          name: editProjName.trim(),
          siteUrl: editProjUrl.trim(),
          description: editProjDesc.trim(),
        });
      } catch (fErr) {
        console.warn('Firestore project update sync note:', fErr);
      }

      setProjectData(prev => prev ? { ...prev, ...updated } : null);
      setProjects(prev => prev.map(p => p.id === selectedProjectId ? { ...p, ...updated } : p));
      setIsEditProjectModalOpen(false);
    } catch (err: any) {
      showAlert(err.message || 'Failed to update project.');
    }
  };

  // 3c. Delete Project (CRUD Delete with In-App Confirm)
  const handleDeleteProject = () => {
    if (!selectedProjectId) return;
    const projNameToDisplay = projectData?.name || projects.find(p => p.id === selectedProjectId)?.name || 'this project';
    setConfirmModalState({
      isOpen: true,
      title: 'Delete Project',
      message: `Are you sure you want to delete project "${projNameToDisplay}"? This will delete all its test cases, test runs, and datasets.`,
      confirmText: 'Delete Project',
      variant: 'danger',
      onConfirm: async () => {
        try {
          try {
            await api.deleteProject(selectedProjectId);
          } catch (apiErr) {
            console.warn('Backend delete project note:', apiErr);
          }
          try {
            await projectService.deleteProject(selectedProjectId);
          } catch (fErr) {
            console.warn('Firestore project delete sync note:', fErr);
          }

          const remaining = projects.filter(p => p && p.id && p.id !== selectedProjectId);
          setProjects(remaining);
          if (remaining.length > 0 && remaining[0]?.id) {
            setSelectedProjectId(remaining[0].id);
          } else {
            setSelectedProjectId(null);
            setProjectData(null);
            setCases([]);
          }
        } catch (err: any) {
          showAlert(err.message || 'Failed to delete project.');
        }
      },
    });
  };

  // 3d. Create Custom Test Case (CRUD Create)
  const handleCreateTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !caseFormTitle.trim()) return;
    try {
      const newCaseData: Partial<TestCase> = {
        title: caseFormTitle.trim(),
        category: caseFormCategory.trim() || 'API Endpoints',
        priority: caseFormPriority,
        type: caseFormType,
        tags: caseFormTags.split(',').map(t => t.trim()).filter(Boolean),
        spec: {
          requests: [
            {
              name: caseFormTitle.trim(),
              method: caseFormMethod,
              path: caseFormPath.trim() || '/',
            },
          ],
          expect: {
            statusIn: [parseInt(caseFormExpectedStatus, 10) || 200],
          },
        },
      };

      const created = await api.createTestCase(selectedProjectId, newCaseData);
      try {
        await testCaseService.createTestCase({
          projectId: selectedProjectId,
          suiteId: created.suiteId || 'custom_suite',
          extId: created.extId || `TC-${Date.now().toString().slice(-4)}`,
          title: created.title,
          category: created.category,
          priority: created.priority,
          type: created.type,
          tags: created.tags,
          spec: created.spec,
          dataFields: created.dataFields || [],
        });
      } catch (fErr) {
        console.warn('Firestore test case create sync note:', fErr);
      }

      setCases(prev => [created, ...prev]);
      setIsNewCaseModalOpen(false);
      setCaseFormTitle('');
      setCaseFormPath('/');
      setCaseFormExpectedStatus('200');
    } catch (err: any) {
      showAlert(err.message || 'Failed to create test case.');
    }
  };

  // 3e. Open Edit Test Case Modal
  const handleOpenEditCase = (c: TestCase) => {
    setEditingCaseId(c.id);
    setCaseFormTitle(c.title);
    setCaseFormCategory(c.category);
    setCaseFormPriority(c.priority as any);
    setCaseFormType(c.type as any);
    setCaseFormTags((c.tags || []).join(', '));
    const req = c.spec?.requests?.[0];
    setCaseFormMethod(req?.method || 'GET');
    setCaseFormPath(req?.path || '/');
    const expected = c.spec?.expect?.statusIn?.[0] || 200;
    setCaseFormExpectedStatus(String(expected));
    setIsEditCaseModalOpen(true);
  };

  // 3f. Update Test Case (CRUD Update)
  const handleUpdateTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !editingCaseId || !caseFormTitle.trim()) return;
    try {
      const updates: Partial<TestCase> = {
        title: caseFormTitle.trim(),
        category: caseFormCategory.trim() || 'API Endpoints',
        priority: caseFormPriority,
        type: caseFormType,
        tags: caseFormTags.split(',').map(t => t.trim()).filter(Boolean),
        spec: {
          requests: [
            {
              name: caseFormTitle.trim(),
              method: caseFormMethod,
              path: caseFormPath.trim() || '/',
            },
          ],
          expect: {
            statusIn: [parseInt(caseFormExpectedStatus, 10) || 200],
          },
        },
      };

      const updated = await api.updateTestCase(selectedProjectId, editingCaseId, updates);
      try {
        await testCaseService.updateTestCase(editingCaseId, updates);
      } catch (fErr) {
        console.warn('Firestore test case update sync note:', fErr);
      }

      setCases(prev => prev.map(c => c.id === editingCaseId ? { ...c, ...updated } : c));
      if (selectedDrawerCase && selectedDrawerCase.id === editingCaseId) {
        setSelectedDrawerCase(prev => prev ? { ...prev, ...updated } : null);
      }
      setIsEditCaseModalOpen(false);
      setEditingCaseId(null);
    } catch (err: any) {
      showAlert(err.message || 'Failed to update test case.');
    }
  };

  // 3g. Delete Test Case (CRUD Delete with In-App Confirm)
  const handleDeleteTestCase = (caseId: string, caseTitle: string) => {
    if (!selectedProjectId) return;
    setConfirmModalState({
      isOpen: true,
      title: 'Delete Test Case',
      message: `Are you sure you want to delete test case "${caseTitle}"?`,
      confirmText: 'Delete Scenario',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.deleteTestCase(selectedProjectId, caseId);
          try {
            await testCaseService.deleteTestCase(caseId);
          } catch (fErr) {
            console.warn('Firestore test case delete sync note:', fErr);
          }

          setCases(prev => prev.filter(c => c.id !== caseId));
          if (selectedDrawerCase && selectedDrawerCase.id === caseId) {
            setSelectedDrawerCase(null);
          }
          setSelectedCaseIds(prev => prev.filter(id => id !== caseId));
        } catch (err: any) {
          showAlert(err.message || 'Failed to delete test case.');
        }
      },
    });
  };

  // 3b. Bulk Run Selected Test Cases (Simultaneously)
  const handleBulkRun = async (mode: 'preview' | 'hosted' = 'preview') => {
    if (!selectedProjectId || selectedCaseIds.length === 0) return;

    const automatedSelected = cases.filter(c => selectedCaseIds.includes(c.id) && c.type !== 'manual');
    if (automatedSelected.length === 0) {
      showAlert('None of the selected test cases are automated (HTTP Functional or Load tests). Manual QA test cases must be verified manually.', 'No Automated Tests Selected', 'info');
      return;
    }

    // Check if any selected cases have missing variables
    const casesWithMissing = automatedSelected.filter(c => (c.missingDataFields || []).length > 0);
    if (casesWithMissing.length > 0) {
      const target = casesWithMissing[0];
      setInteractivePrompt({
        isOpen: true,
        missingField: target.missingDataFields![0],
        testCase: target,
        targetMode: mode,
      });
      return;
    }

    try {
      setIsBulkRunning(true);
      setBulkRunningMode(mode);

      const res = await api.bulkRunTestCases(selectedProjectId, automatedSelected.map(c => c.id), mode);
      
      const runMap = new Map<string, TestRun>();
      res.runs.forEach(run => runMap.set(run.testCaseId, run));

      setCases(prev => prev.map(c => {
        const newRun = runMap.get(c.id);
        return newRun ? { ...c, lastResult: newRun } : c;
      }));

      if (selectedDrawerCase && runMap.has(selectedDrawerCase.id)) {
        setSelectedDrawerCase(prev => (prev ? { ...prev, lastResult: runMap.get(prev.id) } : null));
      }

      showAlert(
        `Simultaneously executed ${res.count} test scenarios in ${mode === 'hosted' ? 'Cloud Runner' : 'Preview'}: ${res.passedCount} passed, ${res.failedCount} failed.`,
        'Simultaneous Execution Complete',
        res.failedCount === 0 ? 'success' : 'info'
      );
    } catch (err: any) {
      if (err.capReached) {
        showAlert(err.message, 'Execution Cap Reached');
      } else if (err.insufficientCredits) {
        setConfirmModalState({
          isOpen: true,
          title: 'Insufficient Cloud Credits',
          message: 'Insufficient credits for hosted Cloud bulk execution. Would you like to top up credits now?',
          confirmText: 'Top Up Credits',
          variant: 'primary',
          onConfirm: () => {
            onOpenBilling();
          },
        });
      } else {
        showAlert(err.message || 'Bulk execution failed.');
      }
    } finally {
      setIsBulkRunning(false);
      setBulkRunningMode(null);
    }
  };

  // 3c. Bulk Delete Selected Test Cases in One Click
  const handleBulkDelete = () => {
    if (!selectedProjectId || selectedCaseIds.length === 0) return;
    const count = selectedCaseIds.length;

    setConfirmModalState({
      isOpen: true,
      title: `Delete ${count} Test ${count === 1 ? 'Case' : 'Cases'}`,
      message: `Are you sure you want to permanently delete the ${count} selected test ${count === 1 ? 'scenario' : 'scenarios'}? This will remove their specifications and test run history from both Verity and Firestore.`,
      confirmText: `Delete ${count} ${count === 1 ? 'Case' : 'Cases'}`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const idsToDelete = [...selectedCaseIds];
          await api.bulkDeleteTestCases(selectedProjectId, idsToDelete);
          try {
            await testCaseService.deleteTestCases(idsToDelete);
          } catch (fErr) {
            console.warn('Firestore bulk delete sync note:', fErr);
          }

          const deleteSet = new Set(idsToDelete);
          setCases(prev => prev.filter(c => !deleteSet.has(c.id)));
          if (selectedDrawerCase && deleteSet.has(selectedDrawerCase.id)) {
            setSelectedDrawerCase(null);
          }
          setSelectedCaseIds([]);
          showAlert(`Successfully deleted ${count} test ${count === 1 ? 'case' : 'cases'}.`, 'Bulk Deletion Complete', 'success');
        } catch (err: any) {
          showAlert(err.message || 'Failed to delete selected test cases.');
        }
      },
    });
  };

  // Selection toggle helpers
  const handleToggleSelectCase = (caseId: string) => {
    setSelectedCaseIds(prev =>
      prev.includes(caseId) ? prev.filter(id => id !== caseId) : [...prev, caseId]
    );
  };

  const handleToggleSelectAll = () => {
    const isAllFilteredSelected = filteredCases.length > 0 && filteredCases.every(c => selectedCaseIds.includes(c.id));
    if (isAllFilteredSelected) {
      const filteredIdSet = new Set(filteredCases.map(c => c.id));
      setSelectedCaseIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const union = new Set([...selectedCaseIds, ...filteredCases.map(c => c.id)]);
      setSelectedCaseIds(Array.from(union));
    }
  };

  const handleClearSelection = () => {
    setSelectedCaseIds([]);
  };

  // 4. Run Single Test Case (with Interactive Data check)
  const handleRunTestCase = async (testCase: TestCase, mode: 'preview' | 'hosted' = 'preview', openDrawer = true) => {
    if (!selectedProjectId || !projectData) return;

    if (openDrawer) {
      setSelectedDrawerCase(testCase);
    }

    // Check if test case has missing variables
    const missing = (testCase.missingDataFields || []);
    if (missing.length > 0) {
      // Trigger interactive prompt!
      setInteractivePrompt({
        isOpen: true,
        missingField: missing[0],
        testCase,
        targetMode: mode,
      });
      return;
    }

    try {
      setRunningCaseId(testCase.id);
      const res = await api.runTestCase(selectedProjectId, testCase.id, mode);

      // Update local state
      setCases(prev => prev.map(c => (c.id === testCase.id ? { ...c, lastResult: res.testRun } : c)));
      setSelectedDrawerCase(prev => (prev && prev.id === testCase.id ? { ...prev, lastResult: res.testRun } : prev));
    } catch (err: any) {
      if (err.capReached) {
        showAlert(err.message, 'Execution Cap Reached');
      } else if (err.insufficientCredits) {
        setConfirmModalState({
          isOpen: true,
          title: 'Insufficient Cloud Credits',
          message: 'Insufficient credits for Cloud Hosted execution. Would you like to top up credits now?',
          confirmText: 'Top Up Credits',
          variant: 'primary',
          onConfirm: () => {
            onOpenBilling();
          },
        });
      } else {
        showAlert(err.message || 'Execution error');
      }
    } finally {
      setRunningCaseId(null);
    }
  };

  // 5. Run All Automated Cases
  const handleRunAll = async (mode: 'preview' | 'hosted' = 'preview') => {
    if (!selectedProjectId) return;
    try {
      setIsRunningAll(true);
      const res = await api.runAllTestCases(selectedProjectId, mode);
      await loadSelectedProject(selectedProjectId);
    } catch (err: any) {
      showAlert(err.message || 'Run all failed');
    } finally {
      setIsRunningAll(false);
    }
  };

  // 6. Save Interactive Data Field & Resume
  const handleSaveInteractiveField = async (field: string, value: any) => {
    if (!selectedProjectId) return;
    await api.patchDatasetField(selectedProjectId, field, value);
    await loadSelectedProject(selectedProjectId);

    // If testCase exists, automatically trigger its run
    if (interactivePrompt.testCase) {
      const targetCase = interactivePrompt.testCase;
      const targetMode = interactivePrompt.targetMode;
      setTimeout(() => {
        handleRunTestCase(targetCase, targetMode);
      }, 200);
    }
  };

  // 7. Record Manual Verdict
  const handleRecordManual = async (testCase: TestCase, pass: boolean, notes: string) => {
    if (!selectedProjectId) return;
    try {
      const res = await api.recordManualResult(selectedProjectId, testCase.id, pass, notes);
      setCases(prev => prev.map(c => (c.id === testCase.id ? { ...c, lastResult: res } : c)));
      if (selectedDrawerCase && selectedDrawerCase.id === testCase.id) {
        setSelectedDrawerCase(prev => (prev ? { ...prev, lastResult: res } : null));
      }
    } catch (err: any) {
      showAlert(err.message);
    }
  };

  // 8. AI Generate Test Suite
  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    setIsAiGenerating(true);
    try {
      const targetUrl = generatorUrl.trim() || projectData?.siteUrl;
      await api.generateAiSuite(selectedProjectId, uploadSuiteName, aiPromptDesc, aiExistingPlan, targetUrl);
      setAiPromptDesc('');
      setAiExistingPlan('');
      setUploadSuiteName('');
      setUserPromptHint('');
      setAppliedArchetype(null);
      await loadSelectedProject(selectedProjectId);
      setActiveTab('cases');
    } catch (err: any) {
      showAlert(err.message || 'AI Generation failed.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 8b. Deep-crawl the site and generate real Playwright/browser test cases
  const handleGenerateBrowserTests = async () => {
    if (!selectedProjectId) return;
    setIsBrowserGenerating(true);
    setBrowserGenResult(null);
    try {
      const targetUrl = generatorUrl.trim() || projectData?.siteUrl;
      const result = await api.generateBrowserTestSuite(selectedProjectId, { targetUrl });
      setBrowserGenResult({
        caseCount: result.caseCount,
        pagesCrawled: result.pagesCrawled,
        totalUrlsDiscovered: result.totalUrlsDiscovered,
        usedSitemap: result.usedSitemap,
        interactiveControlsFound: result.interactiveControlsFound,
        casesNeedingUserData: result.casesNeedingUserData,
      });
      await loadSelectedProject(selectedProjectId);
      setActiveTab('cases');
    } catch (err: any) {
      showAlert(err.message || 'Browser test generation failed.');
    } finally {
      setIsBrowserGenerating(false);
    }
  };

  // 9. Upload Suite (JSON, CSV, Markdown)
  const handleUploadSuite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !uploadContent.trim()) return;
    const format = ingestMode === 'upload_json' ? 'json' : ingestMode === 'upload_csv' ? 'csv' : 'markdown';
    try {
      await api.uploadSuite(selectedProjectId, uploadSuiteName, format, uploadContent.trim());
      setUploadContent('');
      setUploadSuiteName('');
      await loadSelectedProject(selectedProjectId);
      setActiveTab('cases');
    } catch (err: any) {
      showAlert(err.message || 'Upload failed.');
    }
  };

  // 10. Save Dataset via Visual Configurator or Raw JSON
  const handleSaveDatasetCustom = async (newDataset: Record<string, any>) => {
    if (!selectedProjectId) return;
    await api.updateDataset(selectedProjectId, newDataset);
    await loadSelectedProject(selectedProjectId);
  };

  const handleSaveDataset = async () => {
    if (!selectedProjectId) return;
    try {
      const parsed = JSON.parse(rawDatasetText);
      await handleSaveDatasetCustom(parsed);
      setDatasetSaveSuccess(true);
      setTimeout(() => setDatasetSaveSuccess(false), 3000);
    } catch (err: any) {
      showAlert('Invalid JSON: ' + err.message);
    }
  };

  // 11. Download .ZIP package (Production ready with virtual link trigger)
  const handleDownloadPackage = () => {
    if (!selectedProjectId) return;
    const url = api.getDownloadPackageUrl(selectedProjectId);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectData?.name?.replace(/\W+/g, '_') || 'verity-package'}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter cases
  const filteredCases = cases.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.extId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || c.type === filterType;
    const matchesPriority = filterPriority === 'all' || c.priority === filterPriority;
    return matchesSearch && matchesType && matchesPriority;
  });

  // Calculate quick metrics
  const passedCount = cases.filter(c => c.lastResult?.pass === true).length;
  const failedCount = cases.filter(c => c.lastResult?.pass === false).length;
  const notRunCount = cases.filter(c => !c.lastResult).length;

  // Selection metrics for bulk actions
  const isAllFilteredSelected = filteredCases.length > 0 && filteredCases.every(c => selectedCaseIds.includes(c.id));
  const isSomeFilteredSelected = !isAllFilteredSelected && filteredCases.some(c => selectedCaseIds.includes(c.id));
  const automatedCountInSelection = cases.filter(c => selectedCaseIds.includes(c.id) && c.type !== 'manual').length;

  if (!currentUser) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8" data-testid="studio-auth-required">
        <div className="rounded-2xl border border-[#1E2235] bg-[#0E1019]/90 p-8 shadow-2xl backdrop-blur-md md:p-12 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <Shield className="h-8 w-8 text-emerald-400" />
          </div>
          <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1 text-xs font-semibold text-emerald-400">
            Role-Based Access Control (RBAC) Active
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Authentication Required to Access Test Studio
          </h1>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-xl mx-auto">
            Test cases, regression suites, dynamic environment datasets, and execution telemetry are protected and strictly partitioned by organization and user identity. Please sign in to view and manage your test projects.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              disabled={isSigningInGoogle}
              onClick={async () => {
                if (isSigningInGoogle) return;
                setIsSigningInGoogle(true);
                try {
                  await signInWithGoogle();
                } catch (e: any) {
                  if (
                    e?.code !== 'auth/cancelled-popup-request' &&
                    e?.code !== 'auth/popup-closed-by-user' &&
                    !e?.message?.includes('cancelled-popup-request') &&
                    !e?.message?.includes('popup-closed-by-user')
                  ) {
                    console.error('Sign in failed', e);
                  }
                } finally {
                  setIsSigningInGoogle(false);
                }
              }}
              data-testid="studio-auth-google-btn"
              className={`flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 shadow hover:bg-slate-100 transition cursor-pointer ${
                isSigningInGoogle ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              {isSigningInGoogle ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
              )}
              <span>{isSigningInGoogle ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>

            <button
              onClick={() => onOpenAuth?.('login')}
              data-testid="studio-auth-login-btn"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-[#2D334D] bg-[#121520] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#181C2B] transition cursor-pointer"
            >
              Email Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Bar: Project Switcher & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1E2235] pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-3">
          {/* Project selector dropdown */}
          <div className="relative w-full sm:w-auto">
            {projects.length > 0 ? (
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                data-testid="project-switcher-select"
                className="w-full sm:w-auto rounded-xl border border-[#1E2235] bg-[#0F111A] px-3.5 py-2 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                {(projects || []).filter(p => p && p.id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-dashed border-[#2A2E45] bg-[#0F111A] px-3.5 py-2 text-xs font-semibold text-slate-400">
                No Accessible Projects
              </div>
            )}
          </div>

          {projectData && (
            <div className="flex items-center gap-2 min-w-0">
              <a
                href={projectData.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#06070B] px-2.5 py-1 font-mono text-xs text-emerald-300 transition hover:border-emerald-500/50 truncate max-w-[240px] sm:max-w-xs"
              >
                <span className="truncate">{projectData.siteUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
              </a>
            </div>
          )}

          <div className="flex items-center flex-wrap gap-2">
            {projectData && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditProjName(projectData.name);
                    setEditProjUrl(projectData.siteUrl);
                    setEditProjDesc(projectData.description || '');
                    setIsEditProjectModalOpen(true);
                  }}
                  className="flex items-center gap-1 rounded-xl border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-[#1A1D2B] hover:text-white"
                  title="Edit project name, URL, or details in Firestore"
                >
                  <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeleteProject}
                  className="flex items-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                  title="Delete project from Firestore"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                </button>
              </>
            )}

            <button
              onClick={() => setIsNewProjectModalOpen(true)}
              data-testid="new-project-button"
              className="flex items-center gap-1 rounded-xl border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B] hover:border-[#2D334D]"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              <span>New Site Project</span>
            </button>

            <button
              onClick={() => {
                setJourneyModalInitialUrl(projectData?.siteUrl || 'https://ai.whyor.in');
                setIsJourneyModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 shadow-sm shadow-emerald-500/10 transition hover:from-emerald-500/25 hover:to-teal-500/25 hover:border-emerald-500/60"
              title="Start guided URL Introspection Journey"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Introspect Journey</span>
            </button>
          </div>
        </div>

        {/* Global Export & Deploy Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => setIsDeployModalOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B] hover:border-[#2D334D] min-h-[40px] sm:min-h-0"
          >
            <Cloud className="h-4 w-4 text-emerald-400" />
            <span>Multi-Cloud Deploy</span>
          </button>

          <button
            onClick={handleDownloadPackage}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 min-h-[40px] sm:min-h-0"
          >
            <Download className="h-4 w-4" />
            <span>Download Docker Bundle</span>
          </button>
        </div>
      </div>

      {/* Missing Variables Alert Banner */}
      {missingProjectFields.length > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4 backdrop-blur-sm">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Interactive Dataset Engine: <span className="text-amber-300">{missingProjectFields.length} dynamic parameters required</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {missingProjectFields.map((f, i) => (
                  <code key={i} className="rounded bg-[#06070B] px-1.5 py-0.5 font-mono text-[11px] text-emerald-300 border border-[#1E2235]">
                    {`{{${f}}}`}
                  </code>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('dataset')}
            className="self-start sm:self-center rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
          >
            Configure Dataset
          </button>
        </div>
      )}

      {/* Mobile & Tablet Responsive Navigation Bar with Hamburger Menu (visible on screens < lg) */}
      <div className="lg:hidden mt-4 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          {/* Current Active Section Badge & Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              {activeTab === 'cases' && <Layers className="h-4 w-4" />}
              {activeTab === 'analytics' && <TrendingUp className="h-4 w-4" />}
              {activeTab === 'ingest' && <Sparkles className="h-4 w-4" />}
              {activeTab === 'dataset' && <Database className="h-4 w-4" />}
              {activeTab === 'schedules' && <Clock className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white truncate">
                  {activeTab === 'cases' && 'Test Cases'}
                  {activeTab === 'analytics' && 'Analytics & Trends'}
                  {activeTab === 'ingest' && 'Import & AI Generate'}
                  {activeTab === 'dataset' && 'Dataset Configurator'}
                  {activeTab === 'schedules' && 'Scheduled Triggers'}
                </span>
                {activeTab === 'cases' && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                    {cases.length}
                  </span>
                )}
                {activeTab === 'dataset' && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                    {Object.keys(dataset).length} Keys
                  </span>
                )}
                {activeTab === 'schedules' && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                    {schedules.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {activeTab === 'cases' && 'Runner, assertions & specs'}
                {activeTab === 'analytics' && 'Execution telemetry & metrics'}
                {activeTab === 'ingest' && 'Gemini AI suite & OpenAPI'}
                {activeTab === 'dataset' && 'Environment & dynamic vars'}
                {activeTab === 'schedules' && 'Daily, weekly & cron automation'}
              </p>
            </div>
          </div>

          {/* Hamburger Menu Toggle Button with >44px touch target */}
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(prev => !prev)}
            aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#2D334D] bg-[#141724] text-slate-200 hover:bg-[#1C2032] hover:text-white transition active:scale-95"
          >
            {isMobileNavOpen ? (
              <X className="h-5 w-5 text-emerald-400" />
            ) : (
              <Menu className="h-5 w-5 text-emerald-400" />
            )}
          </button>
        </div>

        {/* Hamburger Dropdown Navigation Drawer (Vertical Stacked List) */}
        {isMobileNavOpen && (
          <div className="mt-3 border-t border-[#1E2235] pt-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Studio Navigation
            </div>

            {/* Vertical Stacked Navigation Links */}
            <div className="space-y-1">
              {[
                { id: 'cases', label: 'Test Cases & Live Runner', count: `${cases.length}`, icon: Layers, desc: 'Execute and inspect tests' },
                { id: 'analytics', label: 'Analytics & Trends', icon: TrendingUp, desc: 'Execution telemetry & metrics' },
                { id: 'schedules', label: 'Scheduled Triggers & Cron', count: `${schedules.length}`, icon: Clock, desc: 'Automated daily, weekly & cron runs' },
                { id: 'ingest', label: 'Import / AI Generate', icon: Sparkles, desc: 'Gemini synthesis & OpenAPI upload' },
                { id: 'dataset', label: 'Dataset Configurator', count: `${Object.keys(dataset).length} Keys`, icon: Database, desc: 'Tokens, IDs & environments' },
              ].map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as any);
                      setIsMobileNavOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-emerald-300 border border-emerald-500/30'
                        : 'bg-[#06070B] text-slate-300 hover:bg-[#131622] hover:text-white border border-[#1E2235]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#141724] text-slate-400'
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{item.label}</div>
                        <div className="text-[11px] text-slate-400 truncate">{item.desc}</div>
                      </div>
                    </div>
                    {item.count && (
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold ${
                        isActive ? 'bg-emerald-500/30 text-emerald-300' : 'bg-[#141724] text-slate-400'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions Stacked Section inside Hamburger Drawer */}
            <div className="pt-2 border-t border-[#1E2235]/60 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Quick Actions
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    setBatchModalState({ isOpen: true, mode: 'preview' });
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-[#1E2235] bg-[#0A0C13] p-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-[#131622]"
                >
                  <Play className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Run All Preview</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    setBatchModalState({ isOpen: true, mode: 'hosted' });
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-left text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                >
                  <Cloud className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Run All Cloud (Verity Cloud Runner)</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileNavOpen(false);
                    setIsDeployModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 rounded-xl border border-[#1E2235] bg-[#0A0C13] p-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-[#131622]"
                >
                  <Server className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span>Multi-Cloud Deploy</span>
                </button>

                <a
                  href={`/api/projects/${selectedProjectId}/export?format=csv&token=${encodeURIComponent(api.getToken() || '')}`}
                  download={`${projectData?.name?.replace(/\W+/g, '_') || 'report'}-test-cases.csv`}
                  onClick={() => setIsMobileNavOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl border border-[#1E2235] bg-[#0A0C13] p-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-[#131622]"
                >
                  <Download className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Export Test Cases (CSV)</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Studio Navigation Tabs (visible on desktop lg:flex) */}
      <div className="mt-6 hidden lg:flex flex-wrap items-center justify-between gap-4 border-b border-[#1E2235] pb-3">
        <div className="flex items-center gap-2">
          {[
            { id: 'cases', label: `Test Cases (${cases.length})`, icon: Layers },
            { id: 'analytics', label: 'Analytics & Trends', icon: TrendingUp },
            { id: 'schedules', label: `Schedules & Cron (${schedules.length})`, icon: Clock },
            { id: 'ingest', label: 'Import / AI Generate', icon: Sparkles },
            { id: 'dataset', label: `Dataset (${Object.keys(dataset).length} Keys)`, icon: Database },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                data-testid={`studio-tab-${tab.id}`}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  active
                    ? 'bg-[#1A1D2B] text-emerald-300 ring-1 ring-emerald-500/30 border border-[#1E2235]'
                    : 'text-slate-400 hover:bg-[#131622] hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'cases' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('schedules')}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
              title="Configure automated daily, weekly, or cron triggers"
            >
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span>Schedules ({schedules.length})</span>
            </button>

            <a
              href={`/api/projects/${selectedProjectId}/export?format=csv&token=${encodeURIComponent(api.getToken() || '')}`}
              download={`${projectData?.name?.replace(/\W+/g, '_') || 'report'}-test-cases.csv`}
              className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#0F111A] px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-[#131622] hover:text-white transition"
              title="Export test suite specification and execution results to CSV"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </a>

            <button
              onClick={() => setIsDeployModalOpen(true)}
              data-testid="open-deploy-modal"
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
              title="Deploy standalone Docker container to GCP Cloud Run, AWS ECS, Azure, or Kubernetes"
            >
              <Server className="h-3.5 w-3.5 text-emerald-400" />
              <span>Multi-Cloud Deploy</span>
            </button>

            <button
              onClick={() => setBatchModalState({ isOpen: true, mode: 'preview' })}
              className="flex items-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B]"
              title="Run entire test suite locally in sandbox preview"
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              <span>Run All Preview</span>
            </button>

            <button
              onClick={() => setBatchModalState({ isOpen: true, mode: 'hosted' })}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500"
              title="Execute full test suite on Verity Cloud Runner in us-central1 (1 Credit per scenario)"
            >
              <Cloud className="h-3.5 w-3.5 text-slate-950" />
              <span>Run All Cloud</span>
            </button>
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-[#2A2E45] bg-[#0E1019]/60 p-12 text-center" data-testid="studio-no-projects-view">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <Layers className="h-7 w-7 text-emerald-400" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-white">No Projects Available</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
            {currentUser?.role === 'standalone'
              ? 'As a Standalone Developer, you operate in an isolated personal workspace. You have not created any test projects yet.'
              : currentUser?.role === 'member'
              ? `You are signed in as a Team Member (${currentUser.email}). No test projects are currently assigned to your organization.`
              : `You are signed in as ${currentUser?.name || currentUser?.email}. To begin generating and executing test cases, create a target project.`}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => setIsNewProjectModalOpen(true)}
              data-testid="studio-create-first-project-btn"
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-emerald-400 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Create New Project
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TAB 1: Test Cases & Live Runner */}
          {activeTab === 'cases' && (
        <div className="mt-6 space-y-6">
          {/* Status Metrics Bar - Vertically stacked on mobile, 2-col on tablet, 4-col on desktop */}
          <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl border border-[#1E2235] bg-[#0F111A] p-3.5 sm:p-4 text-left sm:text-center transition hover:border-[#2D334D]">
              <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 sm:hidden shrink-0" />
                <div className="text-xs sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Passed</div>
              </div>
              <div className="text-2xl font-black text-emerald-400">{passedCount}</div>
            </div>
            <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl border border-[#1E2235] bg-[#0F111A] p-3.5 sm:p-4 text-left sm:text-center transition hover:border-[#2D334D]">
              <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400 sm:hidden shrink-0" />
                <div className="text-xs sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Failed</div>
              </div>
              <div className="text-2xl font-black text-rose-400">{failedCount}</div>
            </div>
            <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl border border-[#1E2235] bg-[#0F111A] p-3.5 sm:p-4 text-left sm:text-center transition hover:border-[#2D334D]">
              <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500 sm:hidden shrink-0" />
                <div className="text-xs sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Not Run Yet</div>
              </div>
              <div className="text-2xl font-black text-slate-300">{notRunCount}</div>
            </div>
            <div className="flex items-center justify-between sm:flex-col sm:justify-center rounded-2xl border border-[#1E2235] bg-[#0F111A] p-3.5 sm:p-4 text-left sm:text-center transition hover:border-[#2D334D]">
              <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 sm:hidden shrink-0" />
                <div className="text-xs sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Scenarios</div>
              </div>
              <div className="text-2xl font-black text-emerald-300">{cases.length}</div>
            </div>
          </div>

          {/* New Section: Recharts Test Execution Trends & Analytics Dashboard */}
          <AnalyticsDashboard
            isCompact={true}
            projectId={selectedProjectId || 'all'}
            project={projectData}
            projects={projects}
            onSelectProject={setSelectedProjectId}
            onTriggerRunAll={() => setBatchModalState({ isOpen: true, mode: 'preview' })}
            onExpandFull={() => setActiveTab('analytics')}
          />

          {/* Search & Filter Bar - Stacked on mobile/tablet */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search test ID, title, or category..."
                className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                >
                  <option value="all">All Types</option>
                  <option value="http">HTTP Functional</option>
                  <option value="load">Load Test</option>
                  <option value="manual">Manual QA</option>
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="rounded-xl border border-[#1E2235] bg-[#06070B] px-3 py-2 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                >
                  <option value="all">All Priorities</option>
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCaseFormTitle('');
                  setCaseFormCategory('API Endpoints');
                  setCaseFormPriority('High');
                  setCaseFormType('http');
                  setCaseFormMethod('GET');
                  setCaseFormPath('/');
                  setCaseFormExpectedStatus('200');
                  setCaseFormTags('custom, api');
                  setIsNewCaseModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition min-h-[40px] sm:min-h-0"
                title="Create custom test scenario in Firestore"
              >
                <Plus className="h-3.5 w-3.5 text-emerald-400" />
                <span>+ New Test Case</span>
              </button>
            </div>
          </div>

          {/* Bulk Actions Bar & Selection Header */}
          {filteredCases.length > 0 && (
            <div
              className={`rounded-2xl border transition-all duration-200 ${
                selectedCaseIds.length > 0
                  ? 'border-emerald-500/40 bg-gradient-to-r from-[#0F1424] via-[#10172A] to-[#0D1322] p-3.5 sm:p-4 shadow-xl shadow-emerald-500/5'
                  : 'border-[#1E2235]/70 bg-[#0B0D14]/80 px-4 py-2.5'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Left: Master Checkbox & Selection Stats */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition cursor-pointer ${
                      isAllFilteredSelected
                        ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                        : isSomeFilteredSelected
                        ? 'border-emerald-500/70 bg-emerald-500/20 text-emerald-400'
                        : 'border-[#2D334D] bg-[#0A0C14] hover:border-emerald-500/60 text-transparent'
                    }`}
                    title={isAllFilteredSelected ? 'Deselect all filtered scenarios' : 'Select all filtered scenarios'}
                    aria-label="Toggle selection of all test cases"
                  >
                    {isAllFilteredSelected ? (
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    ) : isSomeFilteredSelected ? (
                      <Minus className="h-3.5 w-3.5 stroke-[3]" />
                    ) : null}
                  </button>

                  <div className="text-xs flex items-center gap-2 flex-wrap">
                    {selectedCaseIds.length > 0 ? (
                      <>
                        <span className="font-bold text-white bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30 font-mono text-[11px]">
                          {selectedCaseIds.length} Selected
                        </span>
                        <span className="text-slate-300 font-medium">
                          out of {filteredCases.length} scenario{filteredCases.length === 1 ? '' : 's'}
                        </span>
                        {automatedCountInSelection < selectedCaseIds.length && (
                          <span className="text-[11px] text-slate-400 hidden sm:inline">
                            ({automatedCountInSelection} automated, {selectedCaseIds.length - automatedCountInSelection} manual)
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400 font-medium">
                        Showing <span className="font-bold text-slate-200">{filteredCases.length}</span> scenario{filteredCases.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {selectedCaseIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="text-[11px] font-medium text-slate-400 hover:text-white underline underline-offset-2 ml-1 cursor-pointer"
                    >
                      Clear
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-[11px] font-medium text-slate-400 hover:text-emerald-300 transition ml-1 cursor-pointer flex items-center gap-1"
                    >
                      <span>(Select All)</span>
                    </button>
                  )}
                </div>

                {/* Right: Bulk Action Controls */}
                {selectedCaseIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Trigger Simultaneously Preview */}
                    <button
                      type="button"
                      onClick={() => handleBulkRun('preview')}
                      disabled={isBulkRunning || automatedCountInSelection === 0}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/60 transition disabled:opacity-50 min-h-[38px] cursor-pointer"
                      title="Trigger all selected automated test cases simultaneously in free preview sandbox"
                    >
                      <Play className={`h-3.5 w-3.5 text-emerald-400 ${isBulkRunning && bulkRunningMode === 'preview' ? 'animate-spin' : ''}`} />
                      <span>
                        {isBulkRunning && bulkRunningMode === 'preview'
                          ? 'Running Preview...'
                          : `Run Preview (${automatedCountInSelection})`}
                      </span>
                    </button>

                    {/* Trigger Simultaneously Cloud */}
                    <button
                      type="button"
                      onClick={() => handleBulkRun('hosted')}
                      disabled={isBulkRunning || automatedCountInSelection === 0}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition disabled:opacity-50 min-h-[38px] cursor-pointer"
                      title="Trigger all selected automated test cases simultaneously on Verity Cloud Runner"
                    >
                      <Cloud className="h-3.5 w-3.5 text-slate-950" />
                      <span>
                        {isBulkRunning && bulkRunningMode === 'hosted'
                          ? 'Running Cloud...'
                          : `Run Cloud (${automatedCountInSelection})`}
                      </span>
                    </button>

                    {/* Bulk Delete in One Click */}
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={isBulkRunning}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 transition disabled:opacity-50 min-h-[38px] cursor-pointer"
                      title="Delete all selected test cases in one click from Verity and Firestore"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                      <span>Delete Selected ({selectedCaseIds.length})</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cases Grid */}
          {filteredCases.length > 0 ? (
            <div className="space-y-3">
              {filteredCases.map(testCase => {
                const result = testCase.lastResult;
                const isRunningThis = runningCaseId === testCase.id;
                const hasMissingData = (testCase.missingDataFields || []).length > 0;
                const isSelected = selectedCaseIds.includes(testCase.id);

                return (
                  <div
                    key={testCase.id}
                    data-testid={`case-row-${testCase.id}`}
                    className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border p-4 transition ${
                      isSelected
                        ? 'border-emerald-500/50 bg-[#121626] shadow-md shadow-emerald-500/5'
                        : 'border-[#1E2235] bg-[#0F111A] hover:border-[#2D334D] hover:bg-[#131622]'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Individual Case Select Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectCase(testCase.id);
                        }}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500 text-slate-950 shadow-xs'
                            : 'border-[#2D334D] bg-[#06070B] hover:border-emerald-500/60 text-transparent'
                        }`}
                        title={isSelected ? `Deselect ${testCase.title}` : `Select ${testCase.title}`}
                        aria-label={isSelected ? `Deselect ${testCase.title}` : `Select ${testCase.title}`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </button>

                      <div
                        onClick={() => setSelectedDrawerCase(testCase)}
                        className="flex-1 cursor-pointer min-w-0"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-[#1A1D2B] px-2 py-0.5 font-mono font-bold text-emerald-300 border border-[#1E2235]">
                            {testCase.extId}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            testCase.type === 'http' ? 'bg-emerald-500/20 text-emerald-300' :
                            testCase.type === 'load' ? 'bg-amber-500/20 text-amber-300' :
                            testCase.type === 'browser' ? 'bg-cyan-500/20 text-cyan-300' :
                            'bg-purple-500/20 text-purple-300'
                          }`}>
                            {testCase.type}
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-400">{testCase.category}</span>
                          {hasMissingData && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                              Needs Data: {testCase.missingDataFields?.join(', ')}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 text-sm font-bold text-white hover:text-emerald-300 transition">
                          {testCase.title}
                        </div>

                        {result && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                            {result.pass ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span>PASSED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 px-2.5 py-0.5 font-bold text-rose-300 border border-rose-500/30">
                                <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                <span>FAILED</span>
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-slate-400 truncate max-w-md">
                              {result.message}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons - responsive stacked on mobile/tablet */}
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#1E2235]/60 lg:pt-0 lg:border-t-0 w-full lg:w-auto">
                      {testCase.type !== 'manual' ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunTestCase(testCase, 'preview', true);
                            }}
                            disabled={isRunningThis}
                            data-testid={`run-preview-${testCase.id}`}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl border border-[#1E2235] bg-[#131622] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#1A1D2B] hover:text-white disabled:opacity-50 min-h-[42px] sm:min-h-0"
                            title="Execute locally in free sandbox preview"
                          >
                            <Play className="h-3 w-3 text-emerald-400" />
                            <span>{isRunningThis ? 'Executing...' : 'Run Preview'}</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunTestCase(testCase, 'hosted', true);
                            }}
                            disabled={isRunningThis}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition disabled:opacity-50 min-h-[42px] sm:min-h-0"
                            title="Execute on Verity Managed Cloud Runner in us-central1 (1 Credit)"
                          >
                            <Cloud className="h-3 w-3 text-slate-950" />
                            <span>Cloud Run</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDrawerCase(testCase);
                            }}
                            className="flex items-center justify-center gap-1 rounded-xl border border-[#1E2235] bg-[#0E1019] px-2.5 py-2 text-xs text-slate-400 hover:text-white transition min-h-[42px] sm:min-h-0"
                            title="Inspect specification, headers, assertions, and execution telemetry"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="sm:hidden lg:inline">Inspect</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setSelectedDrawerCase(testCase)}
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-xl bg-purple-500/20 px-3 py-2 text-xs font-bold text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 min-h-[42px] sm:min-h-0"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Manual QA</span>
                        </button>
                      )}

                      {/* Edit Test Case (Firestore) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditCase(testCase);
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl border border-[#1E2235] bg-[#0E1019] px-2.5 py-2 text-xs text-slate-400 hover:text-white hover:border-[#2D334D] transition min-h-[42px] sm:min-h-0"
                        title="Edit test case in Firestore"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="sm:hidden lg:inline">Edit</span>
                      </button>

                      {/* Delete Test Case (Firestore) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTestCase(testCase.id, testCase.title);
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-400 hover:bg-rose-500/20 transition min-h-[42px] sm:min-h-0"
                        title="Delete test case from Firestore"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1E2235] bg-[#0F111A] p-12 text-center">
              <Layers className="mx-auto h-10 w-10 text-slate-600" />
              <h3 className="mt-3 text-base font-bold text-white">No test cases found</h3>
              <p className="mt-1 text-xs text-slate-400">Import or AI-generate test cases in the tab above.</p>
              <button
                onClick={() => setActiveTab('ingest')}
                className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Import / AI Generate
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: Full Analytics & Trends Dashboard */}
      {activeTab === 'analytics' && (
        <div className="mt-6 space-y-6">
          <AnalyticsDashboard
            isCompact={false}
            projectId={selectedProjectId || 'all'}
            project={projectData}
            projects={projects}
            onSelectProject={setSelectedProjectId}
            onTriggerRunAll={() => setBatchModalState({ isOpen: true, mode: 'hosted' })}
          />
        </div>
      )}

      {/* TAB 2: Ingest & AI Generation */}
      {activeTab === 'ingest' && (
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Mode Switcher */}
          <div className="lg:col-span-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Ingestion Method</div>
            {[
              { id: 'ai', label: 'AI Test Generator (Gemini)', icon: Sparkles },
              { id: 'upload_json', label: 'Upload Structured JSON', icon: FileCode },
              { id: 'upload_csv', label: 'Upload Structured CSV', icon: FileText },
              { id: 'upload_md', label: 'Upload Markdown QA Plan', icon: FileText },
            ].map(m => {
              const Icon = m.icon;
              const active = ingestMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setIngestMode(m.id as any)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-xs font-semibold transition ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 border border-emerald-500/30'
                      : 'border border-[#1E2235] bg-[#0F111A] text-slate-300 hover:bg-[#131622]'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Form */}
          <div className="lg:col-span-8 rounded-2xl border border-[#1E2235] bg-[#0F111A] p-6">
            {ingestMode === 'ai' ? (
              <form onSubmit={handleAiGenerate} className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2235] pb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-emerald-400" />
                    <div>
                      <h3 className="text-base font-bold text-white">Intelligent AI Test Case Generator</h3>
                      <p className="text-xs text-slate-400">
                        Enter any API, endpoint, or web URL. The generator will inspect the service, form the test case descriptions, auto-fill parameters, and craft executable test suites.
                      </p>
                    </div>
                  </div>
                  {urlAnalysis?.detectedType && (
                    <span className="self-start sm:self-center inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                      <Zap className="h-3 w-3 text-emerald-400" />
                      {urlAnalysis.detectedType}
                    </span>
                  )}
                </div>

                {/* Guided Introspection Journey Highlight Banner */}
                <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Interactive URL Introspection Journey</span>
                        <span className="rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-1.5 py-0.5">
                          Recommended Flow
                        </span>
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Journey: <span className="text-emerald-400 font-semibold">URL</span> &rarr; <span className="text-emerald-400 font-semibold">Introspect Website</span> &rarr; <span className="text-emerald-400 font-semibold">Ask Questions to Build Data</span> &rarr; <span className="text-emerald-400 font-semibold">Provide Custom Details</span> &rarr; Generate Suite.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setJourneyModalInitialUrl(generatorUrl || projectData?.siteUrl || 'https://ai.whyor.in');
                      setIsJourneyModalOpen(true);
                    }}
                    className="shrink-0 flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-black shadow-md shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 transition"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Launch Guided Journey</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Step 1: Target URL Input & Real-Time Probing */}
                <div className="space-y-2 rounded-xl border border-[#1E2235] bg-[#06070B] p-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                      <Globe className="h-4 w-4 text-emerald-400" />
                      <span>Target API or Application URL</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {isAnalyzingUrl ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 animate-pulse">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Analyzing URL & forming test cases...
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => triggerUrlAnalysis(generatorUrl, userPromptHint, true)}
                          className="flex items-center gap-1 rounded-lg border border-[#1E2235] bg-[#131622] px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-[#1C2030] hover:text-white transition"
                        >
                          <Sparkles className="h-3 w-3 text-emerald-400" />
                          <span>Re-Analyze URL</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="url"
                      value={generatorUrl}
                      onChange={(e) => {
                        setGeneratorUrl(e.target.value);
                      }}
                      placeholder="https://api.example.com or https://reqres.in/api/users"
                      data-testid="generator-url-input"
                      className="w-full rounded-xl border border-[#1E2235] bg-[#0B0D14] p-3 pl-3 pr-24 font-mono text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none transition shadow-inner"
                    />
                    <div className="absolute right-2 top-2.5">
                      <span className="rounded-md bg-[#131622] px-2 py-1 font-mono text-[10px] text-slate-400 border border-[#1E2235]">
                        Live Probing
                      </span>
                    </div>
                  </div>

                  {/* Quick example URL chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-500">Quick Samples:</span>
                    {[
                      { label: 'ReqRes Users API', url: 'https://reqres.in/api/users' },
                      { label: 'PetStore Swagger', url: 'https://petstore.swagger.io/v2' },
                      { label: 'HttpBin HTTP Probe', url: 'https://httpbin.org/get' },
                      { label: 'GitHub Public API', url: 'https://api.github.com' },
                    ].map((sample) => (
                      <button
                        key={sample.url}
                        type="button"
                        data-testid={`quick-sample-${sample.label.replace(/\s+/g, '-').toLowerCase()}`}
                        onClick={() => {
                          setGeneratorUrl(sample.url);
                          triggerUrlAnalysis(sample.url, userPromptHint, true);
                        }}
                        className="rounded-lg border border-[#1E2235] bg-[#0E1019] px-2 py-0.5 text-[10px] font-mono text-slate-300 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300 transition"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Live AI Test Case Formulation & Auto-Fill Assistant */}
                <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-[#0F1420] to-[#0A0D15] p-4 space-y-3.5 shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                        <Wand2 className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white">Live AI Test Case Formulation</span>
                        <span className="ml-2 text-[11px] text-slate-400">
                          {isAnalyzingUrl ? 'Forming test case descriptions...' : 'Auto-derived from URL & target structure'}
                        </span>
                      </div>
                    </div>

                    {/* Auto-Fill All Button */}
                    <button
                      type="button"
                      onClick={handleAutoFillAll}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-300 transition"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Auto-Fill All Form Fields</span>
                    </button>
                  </div>

                  {/* Auto-Formed Description Preview */}
                  <div className="rounded-lg border border-[#1E2235] bg-[#06070B] p-3 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#1E2235]/60 mb-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Formed Test Case Description & Objectives
                      </span>
                      {urlAnalysis?.description && (
                        <button
                          type="button"
                          onClick={() => setAiPromptDesc(urlAnalysis.description)}
                          className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <ArrowRight className="h-3 w-3" />
                          Use this description
                        </button>
                      )}
                    </div>
                    {isAnalyzingUrl ? (
                      <div className="space-y-1.5 py-1 text-slate-400">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-800"></div>
                        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-800"></div>
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-800"></div>
                      </div>
                    ) : urlAnalysis?.description ? (
                      <p className="text-slate-300 leading-relaxed text-xs">
                        {urlAnalysis.description}
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs italic">
                        Enter a target URL above to start automatically forming test case descriptions.
                      </p>
                    )}
                  </div>

                  {/* One-Click Testing Archetypes (Auto-Fill Buttons) */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Auto-Fill Testing Archetypes:
                    </span>
                    <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleApplyArchetype('security')}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition min-h-[44px] ${
                          appliedArchetype === 'security'
                            ? 'border-emerald-500 bg-emerald-500/20 text-white'
                            : 'border-[#1E2235] bg-[#0E1019] text-slate-300 hover:border-slate-700 hover:bg-[#131622]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                          <Shield className="h-4 w-4 shrink-0" />
                          <span>Security & Auth</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1">
                          JWT, 401/403, RBAC & headers
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyArchetype('load')}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition min-h-[44px] ${
                          appliedArchetype === 'load'
                            ? 'border-emerald-500 bg-emerald-500/20 text-white'
                            : 'border-[#1E2235] bg-[#0E1019] text-slate-300 hover:border-slate-700 hover:bg-[#131622]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                          <Activity className="h-4 w-4 shrink-0" />
                          <span>Burst & Latency</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1">
                          p95 &lt;500ms, concurrency
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyArchetype('crud')}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition min-h-[44px] ${
                          appliedArchetype === 'crud'
                            ? 'border-emerald-500 bg-emerald-500/20 text-white'
                            : 'border-[#1E2235] bg-[#0E1019] text-slate-300 hover:border-slate-700 hover:bg-[#131622]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                          <Database className="h-4 w-4 shrink-0" />
                          <span>Dynamic CRUD</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1">
                          201 Create, ID mutations
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyArchetype('validation')}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition min-h-[44px] ${
                          appliedArchetype === 'validation'
                            ? 'border-emerald-500 bg-emerald-500/20 text-white'
                            : 'border-[#1E2235] bg-[#0E1019] text-slate-300 hover:border-slate-700 hover:bg-[#131622]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Negative & 422</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1">
                          Malformed body & 404
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Suggested Dynamic Variables & Scenarios - Stacked on mobile */}
                  <div className="flex flex-col md:grid md:grid-cols-2 gap-3 pt-1">
                    {/* Variables */}
                    {urlAnalysis?.sampleVariables && urlAnalysis.sampleVariables.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-400">
                          Insert Dynamic Placeholders:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {urlAnalysis.sampleVariables.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => handleInsertVariable(v)}
                              className="rounded-md border border-[#1E2235] bg-[#06070B] px-2 py-0.5 font-mono text-[10px] text-emerald-400 hover:border-emerald-500 hover:bg-emerald-500/10 transition"
                              title={`Click to insert {{${v}}} into test description`}
                            >
                              + {`{{${v}}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Focus Area Tags */}
                    {urlAnalysis?.focusAreas && urlAnalysis.focusAreas.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-slate-400">
                          Add Focus Tags:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {urlAnalysis.focusAreas.map((area) => (
                            <button
                              key={area}
                              type="button"
                              onClick={() => handleInsertFocusArea(area)}
                              className="rounded-md border border-[#1E2235] bg-[#06070B] px-2 py-0.5 text-[10px] text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition"
                            >
                              + {area}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Scenarios Outline */}
                  {urlAnalysis?.quickScenarios && urlAnalysis.quickScenarios.length > 0 && (
                    <div className="rounded-lg border border-[#1E2235]/70 bg-[#080A10] p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-slate-400">
                          Suggested Test Scenarios Preview ({urlAnalysis.quickScenarios.length}):
                        </span>
                        <span className="text-[10px] text-slate-500">Click scenario to add to description</span>
                      </div>
                      <div className="space-y-1">
                        {urlAnalysis.quickScenarios.map((sc, i) => (
                          <div
                            key={i}
                            onClick={() => handleInsertScenario(sc)}
                            className="group flex cursor-pointer items-center justify-between rounded-md p-1.5 text-xs text-slate-300 hover:bg-[#131622] transition"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="text-emerald-400 text-[11px]">#{i + 1}</span>
                              <span className="truncate">{sc}</span>
                            </span>
                            <span className="text-[10px] text-emerald-400 opacity-0 group-hover:opacity-100 transition whitespace-nowrap ml-2">
                              + Insert
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 3: User Guidance / Custom Requirements */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      User Guidance & Custom Prompt (Optional)
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Auto-refines description as you type
                    </span>
                  </div>
                  <input
                    type="text"
                    value={userPromptHint}
                    onChange={(e) => setUserPromptHint(e.target.value)}
                    placeholder="e.g. Focus on cart checkout, token expiration, search filters, and rate limiting"
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Step 4: Suite Name (Auto-filled & Editable) */}
                <div>
                  <label className="text-xs font-semibold text-slate-300">Test Suite Name</label>
                  <input
                    type="text"
                    value={uploadSuiteName}
                    onChange={(e) => setUploadSuiteName(e.target.value)}
                    placeholder="e.g. ReqRes Users Functional & RBAC Suite"
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none font-medium"
                  />
                </div>

                {/* Step 5: Description & Focus Areas (Auto-filled & Editable) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Test Case Description & Execution Plan
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (urlAnalysis?.description) setAiPromptDesc(urlAnalysis.description);
                      }}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                    >
                      Reset to Auto-Formed
                    </button>
                  </div>
                  <textarea
                    value={aiPromptDesc}
                    onChange={(e) => setAiPromptDesc(e.target.value)}
                    rows={4}
                    placeholder="Auto-formed description will appear here as you enter the URL..."
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none font-sans leading-relaxed"
                  />
                </div>

                {/* Step 6: OpenAPI / Swagger Specification Notes (Optional) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      OpenAPI / Swagger Endpoints Specification (Optional)
                    </label>
                    {urlAnalysis?.suggestedOpenApiDoc && (
                      <button
                        type="button"
                        onClick={() => setAiExistingPlan(urlAnalysis.suggestedOpenApiDoc)}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        Auto-Fill Suggested Spec
                      </button>
                    )}
                  </div>
                  <textarea
                    value={aiExistingPlan}
                    onChange={(e) => setAiExistingPlan(e.target.value)}
                    rows={3}
                    placeholder="Auto-suggested endpoints or paste your OpenAPI schema here..."
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 font-mono text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Bottom Bar: Auto-Fill Toggle & Generate Button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#1E2235]">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoFillEnabled}
                      onChange={(e) => setAutoFillEnabled(e.target.checked)}
                      className="rounded border-[#1E2235] bg-[#06070B] text-emerald-500 focus:ring-0"
                    />
                    <span>Automatically auto-fill form fields when URL changes</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isAiGenerating}
                    data-testid="ai-generate-submit"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-7 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 transition"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isAiGenerating ? 'Generating Test Cases with Gemini...' : 'Generate AI Test Suite'}</span>
                  </button>
                </div>

                {/* Browser / Playwright test generation — deep-crawls the site's
                    real pages (not just the one URL above) and generates real
                    browser automation tests: page-health checks (console
                    errors, broken links) plus form-fill-and-submit tests. */}
                <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white">Deep-Crawl & Generate Browser Tests</h4>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Crawls every page reachable from this site (same-origin, respects robots.txt), finds real forms and links,
                    and generates executable Playwright-style browser tests — page-health checks and form-submission tests —
                    for each one. Sensitive fields (passwords, payment details) are never guessed; they're flagged below for
                    you to supply in the dataset instead.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateBrowserTests}
                    disabled={isBrowserGenerating}
                    data-testid="generate-browser-tests-submit"
                    className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 transition"
                  >
                    <Server className="h-4 w-4" />
                    <span>{isBrowserGenerating ? 'Crawling site & generating browser tests…' : 'Deep-Crawl & Generate Browser Tests'}</span>
                  </button>

                  {browserGenResult && (
                    <div className="mt-4 rounded-xl border border-[#1E2235] bg-[#06070B] p-3 text-xs">
                      <p className="text-emerald-300 font-semibold">
                        Crawled {browserGenResult.pagesCrawled} of {browserGenResult.totalUrlsDiscovered} page(s) discovered
                        {browserGenResult.usedSitemap && ' (via sitemap.xml + link-following)'}
                        {' '}and generated {browserGenResult.caseCount} browser test case(s), covering {browserGenResult.interactiveControlsFound} interactive control(s) (buttons, JS-driven links, tabs, menus, disclosures).
                      </p>
                      {browserGenResult.casesNeedingUserData.length > 0 && (
                        <div className="mt-2">
                          <p className="text-amber-300 font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {browserGenResult.casesNeedingUserData.length} test(s) need real test data before they can run:
                          </p>
                          <ul className="mt-1.5 space-y-1 text-slate-400">
                            {browserGenResult.casesNeedingUserData.map(c => (
                              <li key={c.id} className="pl-2 border-l-2 border-amber-500/30">
                                <span className="text-slate-200">{c.title}</span>
                                <span className="text-slate-500"> — needs: </span>
                                <span className="font-mono text-amber-300">{c.dataFields.join(', ')}</span>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => setActiveTab('dataset')}
                            className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                          >
                            Go to Dataset Configurator to fill these in →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </form>
            ) : (
              <form onSubmit={handleUploadSuite} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white capitalize">Upload {ingestMode.replace('upload_', '')} Specification</h3>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Suite Name</label>
                  <input
                    type="text"
                    value={uploadSuiteName}
                    onChange={(e) => setUploadSuiteName(e.target.value)}
                    placeholder="e.g. Imported Regression Suite"
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Content (Paste or drag text)</label>
                  <textarea
                    value={uploadContent}
                    onChange={(e) => setUploadContent(e.target.value)}
                    rows={12}
                    placeholder={
                      ingestMode === 'upload_json' ? '[\n  {\n    "id": "TC-001",\n    "title": "Health check",\n    "category": "Smoke",\n    "requests": [{ "method": "GET", "path": "/health" }]\n  }\n]' :
                      ingestMode === 'upload_csv' ? 'id,category,title,priority,tags,type,path,method,expected_status\nTC-001,Smoke,Health Check,High,smoke,http,/,GET,200' :
                      '| ID | Category | Title | Priority | Method | Path | Expected Status |\n|---|---|---|---|---|---|---|\n| TC-001 | Smoke | Home Page | High | GET | / | 200 |'
                    }
                    className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-3 font-mono text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Parse & Ingest Test Suite</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Interactive Dataset Engine */}
      {activeTab === 'dataset' && projectData && (
        <div className="mt-6">
          <DatasetConfigurator
            project={projectData}
            testCases={cases}
            allNeededFields={allNeededFields}
            missingProjectFields={missingProjectFields}
            dataset={dataset}
            onSaveDataset={handleSaveDatasetCustom}
            onRunTestCase={handleRunTestCase}
          />
        </div>
      )}

          {/* TAB 4: Test Suite Schedules & Autonomous Triggers */}
          {activeTab === 'schedules' && projectData && (
            <div className="mt-6">
              <TestSchedulerTab
                project={projectData}
                suites={suites}
                testCases={cases}
                onTriggerRunAll={() => setBatchModalState({ isOpen: true, mode: 'preview' })}
              />
            </div>
          )}
        </>
      )}

      {/* New Project Modal */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 sm:p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Create New Test Target Project</h3>
            <p className="mt-1 text-xs text-slate-400">Specify the website or API endpoint you want to automate.</p>
            <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Project Name</label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g. E-Commerce Staging API"
                  required
                  data-testid="new-project-name-input"
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <label className="text-xs font-semibold text-slate-300">Target Site / API URL</label>
                  {newProjUrl && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!newProjUrl.trim()) return;
                        setIsAnalyzingProjUrl(true);
                        try {
                          const res = await api.analyzeUrl(newProjUrl.trim());
                          if (res.suggestedSuiteName && !newProjName) {
                            setNewProjName(res.suggestedSuiteName.replace(/Suite$/, 'API').replace(/Automation$/, 'Target'));
                          }
                          if (res.description && !newProjDesc) {
                            setNewProjDesc(res.description.slice(0, 110) + '...');
                          }
                        } catch {
                          // Handled gracefully by fallback
                        } finally {
                          setIsAnalyzingProjUrl(false);
                        }
                      }}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                    >
                      <Sparkles className="h-3 w-3" />
                      {isAnalyzingProjUrl ? 'Analyzing...' : 'Auto-fill Name & Description'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={newProjUrl}
                  onChange={(e) => setNewProjUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  required
                  data-testid="new-project-url-input"
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Description (Optional)</label>
                <input
                  type="text"
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Automated smoke and load verification"
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-[#1E2235]/60 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    const urlToUse = newProjUrl.trim() || 'https://ai.whyor.in';
                    setIsNewProjectModalOpen(false);
                    setJourneyModalInitialUrl(urlToUse);
                    setIsJourneyModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition min-h-[40px] sm:min-h-0"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Launch Guided Journey</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewProjectModalOpen(false)}
                    className="flex-1 sm:flex-initial rounded-xl border border-[#1E2235] bg-[#131622] px-4 py-2 text-xs font-semibold text-slate-300 min-h-[40px] sm:min-h-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingProject}
                    data-testid="new-project-submit"
                    className={`flex-1 sm:flex-initial rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition min-h-[40px] sm:min-h-0 flex items-center justify-center gap-1.5 ${
                      isCreatingProject ? 'opacity-60 cursor-wait' : ''
                    }`}
                  >
                    {isCreatingProject && (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    )}
                    <span>{isCreatingProject ? 'Creating...' : 'Create Project'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Project */}
      {isEditProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
              <h3 className="text-base font-bold text-white">Edit Project Details</h3>
              <button
                type="button"
                onClick={() => setIsEditProjectModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateProject} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Project Name</label>
                <input
                  type="text"
                  required
                  value={editProjName}
                  onChange={e => setEditProjName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Target Site URL</label>
                <input
                  type="url"
                  required
                  value={editProjUrl}
                  onChange={e => setEditProjUrl(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Description</label>
                <textarea
                  rows={3}
                  value={editProjDesc}
                  onChange={e => setEditProjDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditProjectModalOpen(false)}
                  className="flex-1 sm:flex-initial rounded-xl border border-[#1E2235] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white min-h-[40px] sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 min-h-[40px] sm:min-h-0"
                >
                  Save to Firestore
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Test Case */}
      {isNewCaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Create New Test Case</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCaseModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTestCase} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Scenario Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Verify User Profile Fetch Returns 200"
                  value={caseFormTitle}
                  onChange={e => setCaseFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category / Suite</label>
                  <input
                    type="text"
                    required
                    value={caseFormCategory}
                    onChange={e => setCaseFormCategory(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
                  <select
                    value={caseFormPriority}
                    onChange={e => setCaseFormPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
                  <select
                    value={caseFormType}
                    onChange={e => setCaseFormType(e.target.value as any)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                  >
                    <option value="http">HTTP Functional</option>
                    <option value="load">Load Test</option>
                    <option value="manual">Manual QA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">HTTP Method</label>
                  <select
                    value={caseFormMethod}
                    onChange={e => setCaseFormMethod(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Status</label>
                  <input
                    type="number"
                    value={caseFormExpectedStatus}
                    onChange={e => setCaseFormExpectedStatus(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Endpoint Path</label>
                <input
                  type="text"
                  required
                  placeholder="/api/v1/resource or {{baseUrl}}/profile"
                  value={caseFormPath}
                  onChange={e => setCaseFormPath(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs font-mono text-emerald-300 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. auth, smoke, regression"
                  value={caseFormTags}
                  onChange={e => setCaseFormTags(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => setIsNewCaseModalOpen(false)}
                  className="flex-1 sm:flex-initial rounded-xl border border-[#1E2235] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white min-h-[40px] sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-500 min-h-[40px] sm:min-h-0"
                >
                  Create in Firestore
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Test Case */}
      {isEditCaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[#1E2235] bg-[#0F111A] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E2235] pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Edit Test Case</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditCaseModalOpen(false);
                  setEditingCaseId(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateTestCase} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Scenario Title</label>
                <input
                  type="text"
                  required
                  value={caseFormTitle}
                  onChange={e => setCaseFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category / Suite</label>
                  <input
                    type="text"
                    required
                    value={caseFormCategory}
                    onChange={e => setCaseFormCategory(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
                  <select
                    value={caseFormPriority}
                    onChange={e => setCaseFormPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
                  <select
                    value={caseFormType}
                    onChange={e => setCaseFormType(e.target.value as any)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                  >
                    <option value="http">HTTP Functional</option>
                    <option value="load">Load Test</option>
                    <option value="manual">Manual QA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">HTTP Method</label>
                  <select
                    value={caseFormMethod}
                    onChange={e => setCaseFormMethod(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Status</label>
                  <input
                    type="number"
                    value={caseFormExpectedStatus}
                    onChange={e => setCaseFormExpectedStatus(e.target.value)}
                    className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Endpoint Path</label>
                <input
                  type="text"
                  required
                  value={caseFormPath}
                  onChange={e => setCaseFormPath(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs font-mono text-emerald-300 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={caseFormTags}
                  onChange={e => setCaseFormTags(e.target.value)}
                  className="w-full rounded-xl border border-[#1E2235] bg-[#06070B] px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-[#1E2235]">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditCaseModalOpen(false);
                    setEditingCaseId(null);
                  }}
                  className="flex-1 sm:flex-initial rounded-xl border border-[#1E2235] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white min-h-[40px] sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-500 min-h-[40px] sm:min-h-0"
                >
                  Save Changes to Firestore
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Missing Data Modal */}
      <InteractiveDataModal
        isOpen={interactivePrompt.isOpen}
        onClose={() => setInteractivePrompt(prev => ({ ...prev, isOpen: false }))}
        missingField={interactivePrompt.missingField}
        testCase={interactivePrompt.testCase}
        siteUrl={projectData?.siteUrl || ''}
        onSaveAndResume={handleSaveInteractiveField}
      />

      {/* Cloud Deploy Guide Modal */}
      <CloudDeployModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
        project={projectData}
        onDownload={handleDownloadPackage}
      />

      {/* Test Detail Inspector Drawer */}
      <TestDetailDrawer
        testCase={selectedDrawerCase}
        onClose={() => setSelectedDrawerCase(null)}
        onRunTest={handleRunTestCase}
        onRecordManual={handleRecordManual}
        isRunning={runningCaseId === selectedDrawerCase?.id}
      />

      {/* Production Batch Execution Modal */}
      {selectedProjectId && projectData && (
        <BatchExecutionModal
          isOpen={batchModalState.isOpen}
          onClose={() => {
            setBatchModalState(prev => ({ ...prev, isOpen: false }));
            if (selectedProjectId) loadSelectedProject(selectedProjectId);
          }}
          project={projectData}
          projectId={selectedProjectId}
          projectName={projectData.name}
          testCases={(cases || []).filter(c => c && c.type !== 'manual')}
          mode={batchModalState.mode}
          onOpenBilling={onOpenBilling}
          onRunFinished={async () => {
            if (selectedProjectId) await loadSelectedProject(selectedProjectId);
          }}
          onRunComplete={(results) => {
            setCases(prev => prev.map(c => {
              if (!c) return c;
              const matched = (results || []).find(r => r && r.caseId === c.id);
              return matched ? { ...c, lastResult: matched.testRun } : c;
            }));
          }}
        />
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

      {/* Interactive URL Introspection Journey Wizard Modal */}
      <IntrospectionJourneyModal
        isOpen={isJourneyModalOpen}
        onClose={() => setIsJourneyModalOpen(false)}
        onSuccess={handleJourneySuccess}
        initialUrl={journeyModalInitialUrl}
        projectId={selectedProjectId || undefined}
        existingProjectName={projectData?.name}
      />
    </div>
  );
};
