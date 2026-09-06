import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Project, TestCase, TestRun, Suite, User, TestSchedule } from '../types';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with custom databaseId from configuration
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// ----------------------------------------------------------------------
// FIRESTORE ERROR HANDLING (as mandated by firebase-integration skill)
// ----------------------------------------------------------------------
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection validation as per skill specification
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase notice: Client is offline or database initializing.');
    }
    return false;
  }
}
testConnection();

// Type definitions for Firestore Datasets
export interface FirestoreDataset {
  id: string;
  projectId?: string;
  name: string;
  environment: string;
  description: string;
  variables: Record<string, any>;
  isDefault: boolean;
  ownerUserId?: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------
// AUTHENTICATION WITH GOOGLE
// ----------------------------------------------------------------------

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const fbUser = result.user;
  return await syncGoogleUserToFirestore(fbUser);
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export async function syncGoogleUserToFirestore(fbUser: FirebaseUser): Promise<User> {
  const userRef = doc(db, 'users', fbUser.uid);
  const userSnap = await getDoc(userRef);

  const now = new Date().toISOString();
  let appUser: User;

  if (userSnap.exists()) {
    const existing = userSnap.data() as Partial<User>;
    appUser = {
      id: fbUser.uid,
      email: fbUser.email || existing.email || 'user@verity.dev',
      name: fbUser.displayName || existing.name || 'Google Developer',
      role: existing.role || 'standalone',
      orgId: existing.orgId,
      teamId: existing.teamId,
      creditsBalance: existing.creditsBalance !== undefined ? existing.creditsBalance : 100,
      createdAt: existing.createdAt || now,
    };
    await updateDoc(userRef, {
      name: appUser.name,
      email: appUser.email,
      photoURL: fbUser.photoURL || '',
      updatedAt: now,
    });
  } else {
    appUser = {
      id: fbUser.uid,
      email: fbUser.email || 'user@verity.dev',
      name: fbUser.displayName || 'Google Developer',
      role: 'standalone',
      creditsBalance: 100, // 100 Free Welcome Cloud Credits for Google sign-in
      createdAt: now,
    };
    await setDoc(userRef, {
      ...appUser,
      photoURL: fbUser.photoURL || '',
      updatedAt: now,
    });
  }

  return appUser;
}

export function subscribeAuthState(callback: (user: User | null, fbUser: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const u = userSnap.data() as User;
          callback(u, fbUser);
        } else {
          const created = await syncGoogleUserToFirestore(fbUser);
          callback(created, fbUser);
        }
      } catch (err) {
        console.error('Error fetching Firestore user profile:', err);
        callback({
          id: fbUser.uid,
          email: fbUser.email || '',
          name: fbUser.displayName || 'Google User',
          role: 'standalone',
          creditsBalance: 100,
          createdAt: new Date().toISOString(),
        }, fbUser);
      }
    } else {
      callback(null, null);
    }
  });
}

// ----------------------------------------------------------------------
// DATASET CRUD OPERATIONS (Firestore 'datasets')
// ----------------------------------------------------------------------

export const datasetService = {
  // Create a new dataset collection / environment
  async createDataset(data: {
    projectId?: string;
    name: string;
    environment: string;
    description?: string;
    variables: Record<string, any>;
    isDefault?: boolean;
    ownerUserId?: string;
  }): Promise<FirestoreDataset> {
    const id = 'ds_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const newDataset: FirestoreDataset = {
      id,
      projectId: data.projectId || '',
      name: data.name.trim(),
      environment: data.environment.trim() || 'default',
      description: data.description || '',
      variables: data.variables || {},
      isDefault: !!data.isDefault,
      ownerUserId: data.ownerUserId || auth.currentUser?.uid || '',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'datasets', id), newDataset);
    return newDataset;
  },

  // Read all datasets (optionally filtered by project)
  async getDatasets(projectId?: string): Promise<FirestoreDataset[]> {
    let q;
    if (projectId) {
      q = query(collection(db, 'datasets'), where('projectId', '==', projectId));
    } else {
      q = query(collection(db, 'datasets'));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as FirestoreDataset);
  },

  // Subscribe to real-time updates for datasets
  subscribeDatasets(projectId: string | undefined, callback: (datasets: FirestoreDataset[]) => void) {
    let q;
    if (projectId) {
      q = query(collection(db, 'datasets'), where('projectId', '==', projectId));
    } else {
      q = query(collection(db, 'datasets'));
    }
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => d.data() as FirestoreDataset);
      callback(list);
    }, (err) => {
      console.warn('Datasets snapshot error:', err);
    });
  },

  // Read a single dataset by ID
  async getDataset(id: string): Promise<FirestoreDataset | null> {
    const snap = await getDoc(doc(db, 'datasets', id));
    if (!snap.exists()) return null;
    return snap.data() as FirestoreDataset;
  },

  // Update an entire dataset or its attributes
  async updateDataset(id: string, updates: Partial<FirestoreDataset>): Promise<void> {
    const ref = doc(db, 'datasets', id);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  },

  // Delete a dataset
  async deleteDataset(id: string): Promise<void> {
    await deleteDoc(doc(db, 'datasets', id));
  },

  // Variable-level CRUD within a dataset:
  async setVariable(datasetId: string, key: string, value: any): Promise<void> {
    const ds = await this.getDataset(datasetId);
    if (!ds) throw new Error('Dataset not found: ' + datasetId);
    const updatedVars = { ...ds.variables, [key]: value };
    await this.updateDataset(datasetId, { variables: updatedVars });
  },

  async deleteVariable(datasetId: string, key: string): Promise<void> {
    const ds = await this.getDataset(datasetId);
    if (!ds) throw new Error('Dataset not found: ' + datasetId);
    const updatedVars = { ...ds.variables };
    delete updatedVars[key];
    await this.updateDataset(datasetId, { variables: updatedVars });
  }
};

// ----------------------------------------------------------------------
// PROJECT CRUD OPERATIONS (Firestore 'projects')
// ----------------------------------------------------------------------

export const projectService = {
  // Create Project
  async createProject(data: {
    id?: string;
    name: string;
    siteUrl: string;
    description?: string;
    dataset?: Record<string, any>;
    tags?: string[];
    ownerUserId?: string;
    orgId?: string | null;
  }): Promise<Project> {
    const id = data.id || ('proj_' + Math.random().toString(36).substr(2, 9));
    const now = new Date().toISOString();
    const newProject: Project = {
      id,
      name: data.name.trim(),
      siteUrl: data.siteUrl.trim(),
      description: data.description || '',
      orgId: data.orgId || null,
      dataset: data.dataset || {
        baseUrl: data.siteUrl.trim(),
        authTokens: {},
      },
      ownerUserId: data.ownerUserId || auth.currentUser?.uid || 'google_user',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'projects', id), newProject);

    // Also auto-create a matching default Firestore dataset entity
    await datasetService.createDataset({
      projectId: id,
      name: `${newProject.name} Default Dataset`,
      environment: 'production',
      description: `Primary dynamic variables for ${newProject.name}`,
      variables: newProject.dataset,
      isDefault: true,
      ownerUserId: newProject.ownerUserId,
    });

    return newProject;
  },

  // Read all projects
  async getProjects(): Promise<Project[]> {
    const q = query(collection(db, 'projects'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Project);
  },

  // Subscribe to real-time projects
  subscribeProjects(callback: (projects: Project[]) => void) {
    const q = query(collection(db, 'projects'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => d.data() as Project);
      callback(list);
    }, (err) => {
      console.warn('Projects snapshot error:', err);
    });
  },

  // Read single project
  async getProject(projectId: string): Promise<Project | null> {
    const snap = await getDoc(doc(db, 'projects', projectId));
    if (!snap.exists()) return null;
    return snap.data() as Project;
  },

  // Update Project
  async updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
    const ref = doc(db, 'projects', projectId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    // If dataset variables updated, sync to default dataset record
    if (updates.dataset) {
      const datasets = await datasetService.getDatasets(projectId);
      const defaultDs = datasets.find(d => d.isDefault) || datasets[0];
      if (defaultDs) {
        await datasetService.updateDataset(defaultDs.id, {
          variables: updates.dataset,
        });
      }
    }
  },

  // Delete Project (and cascades all associated test cases and datasets)
  async deleteProject(projectId: string): Promise<void> {
    // Delete project doc
    await deleteDoc(doc(db, 'projects', projectId));

    // Cascade delete test cases
    const tcQuery = query(collection(db, 'test_cases'), where('projectId', '==', projectId));
    const tcSnap = await getDocs(tcQuery);
    const deletePromises = tcSnap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    // Cascade delete datasets
    const dsQuery = query(collection(db, 'datasets'), where('projectId', '==', projectId));
    const dsSnap = await getDocs(dsQuery);
    await Promise.all(dsSnap.docs.map(d => deleteDoc(d.ref)));

    // Cascade delete suites
    const suiteQuery = query(collection(db, 'suites'), where('projectId', '==', projectId));
    const suiteSnap = await getDocs(suiteQuery);
    await Promise.all(suiteSnap.docs.map(d => deleteDoc(d.ref)));
  }
};

// ----------------------------------------------------------------------
// TEST CASES CRUD OPERATIONS (Firestore 'test_cases')
// ----------------------------------------------------------------------

export const testCaseService = {
  // Create Test Case
  async createTestCase(data: Omit<TestCase, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<TestCase> {
    const id = data.id || 'tc_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const newCase: TestCase = {
      ...data,
      id,
      createdAt: data.createdAt || now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'test_cases', id), newCase);
    return newCase;
  },

  // Read test cases for a project
  async getTestCases(projectId: string): Promise<TestCase[]> {
    const q = query(collection(db, 'test_cases'), where('projectId', '==', projectId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as TestCase);
  },

  // Subscribe to real-time test cases for project
  subscribeTestCases(projectId: string, callback: (cases: TestCase[]) => void) {
    const q = query(collection(db, 'test_cases'), where('projectId', '==', projectId));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => d.data() as TestCase);
      callback(list);
    }, (err) => {
      console.warn('TestCases snapshot error:', err);
    });
  },

  // Update Test Case
  async updateTestCase(id: string, updates: Partial<TestCase>): Promise<void> {
    const ref = doc(db, 'test_cases', id);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  },

  // Delete Test Case
  async deleteTestCase(id: string): Promise<void> {
    await deleteDoc(doc(db, 'test_cases', id));
  },

  // Bulk Delete Test Cases
  async deleteTestCases(ids: string[]): Promise<void> {
    const promises = ids.map(id => deleteDoc(doc(db, 'test_cases', id)));
    await Promise.all(promises);
  }
};

// ----------------------------------------------------------------------
// TEST RUNS CRUD OPERATIONS (Firestore 'test_runs')
// ----------------------------------------------------------------------

export const testRunService = {
  // Create / Record Run
  async recordRun(run: TestRun): Promise<TestRun> {
    await setDoc(doc(db, 'test_runs', run.id), run);
    return run;
  },

  // Read runs for project
  async getTestRuns(projectId: string): Promise<TestRun[]> {
    const q = query(collection(db, 'test_runs'), where('projectId', '==', projectId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as TestRun);
  },

  // Delete single test run
  async deleteTestRun(runId: string): Promise<void> {
    await deleteDoc(doc(db, 'test_runs', runId));
  },

  // Clear all runs for a project
  async clearRunsForProject(projectId: string): Promise<void> {
    const q = query(collection(db, 'test_runs'), where('projectId', '==', projectId));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }
};

// ----------------------------------------------------------------------
// SCHEDULE SERVICE (Firestore 'test_schedules')
// ----------------------------------------------------------------------

export const scheduleService = {
  async getSchedules(projectId: string): Promise<TestSchedule[]> {
    try {
      const q = query(collection(db, 'test_schedules'), where('projectId', '==', projectId));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as TestSchedule);
    } catch (err: any) {
      console.warn('Firestore getSchedules notice:', err);
      return [];
    }
  },

  async saveSchedule(schedule: TestSchedule): Promise<void> {
    try {
      await setDoc(doc(db, 'test_schedules', schedule.id), schedule, { merge: true });
    } catch (err: any) {
      console.warn('Firestore saveSchedule notice:', err);
    }
  },

  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'test_schedules', scheduleId));
    } catch (err: any) {
      console.warn('Firestore deleteSchedule notice:', err);
    }
  },
};

// ----------------------------------------------------------------------
// INITIAL DATASET SEEDER (Seeds Firestore if empty so user has ready-to-test apps)
// ----------------------------------------------------------------------

export async function ensureFirestoreInitialized() {
  try {
    const existing = await projectService.getProjects();
    if (existing.length > 0) {
      return; // Already initialized
    }

    console.log('Seeding initial Firestore datasets & projects...');

    // 1. Seed GitHub REST Project
    const ghProject: Project = {
      id: 'proj_github_api',
      ownerUserId: 'system_admin',
      name: 'GitHub Public REST API Suite',
      siteUrl: 'https://api.github.com',
      description: 'Automated functional test suite verifying public GitHub rate-limits, repositories, and user search APIs.',
      dataset: {
        baseUrl: 'https://api.github.com',
        userAgent: 'Verity-Automated-Test-Runner/1.0',
        test_org: 'octocat',
        test_repo: 'Hello-World',
        authTokens: {
          guest: '',
          user: '',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'projects', ghProject.id), ghProject);

    // Seed GH Default Dataset
    await datasetService.createDataset({
      projectId: ghProject.id,
      name: 'GitHub Staging Environment',
      environment: 'staging',
      description: 'Dynamic parameters and header variables for GitHub API test cases',
      variables: ghProject.dataset,
      isDefault: true,
      ownerUserId: 'system_admin',
    });

    // Seed GH Secondary Dataset (Production Rate-Limit Testing)
    await datasetService.createDataset({
      projectId: ghProject.id,
      name: 'GitHub Production High-Concurrency',
      environment: 'production',
      description: 'Production target dataset with enterprise rate limits and user agent headers',
      variables: {
        baseUrl: 'https://api.github.com',
        userAgent: 'Verity-Enterprise-Auditor/2.0',
        test_org: 'torvalds',
        test_repo: 'linux',
      },
      isDefault: false,
      ownerUserId: 'system_admin',
    });

    // Seed GH Test Cases
    const ghCases: TestCase[] = [
      {
        id: 'tc_gh_01',
        projectId: ghProject.id,
        extId: 'GH-001',
        category: 'System & Rate Limits',
        title: 'Verify root API endpoint and rate limit status headers',
        priority: 'High',
        tags: ['smoke', 'api', 'headers'],
        type: 'http',
        spec: {
          requests: [
            {
              name: 'Fetch Root API Manifest',
              method: 'GET',
              path: '/rate_limit',
              headers: {
                'User-Agent': '{{userAgent}}',
                'Accept': 'application/vnd.github+json',
              },
            },
          ],
          expect: {
            statusIn: [200, 304],
            bodyContains: ['rate', 'resources', 'core'],
          },
        },
        dataFields: ['userAgent'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tc_gh_02',
        projectId: ghProject.id,
        extId: 'GH-002',
        category: 'Repository Endpoints',
        title: 'Retrieve repository metadata with dynamic {{test_org}} and {{test_repo}}',
        priority: 'High',
        tags: ['regression', 'repos'],
        type: 'http',
        spec: {
          requests: [
            {
              name: 'Fetch Octocat Repository',
              method: 'GET',
              path: '/repos/{{test_org}}/{{test_repo}}',
              headers: {
                'User-Agent': '{{userAgent}}',
              },
            },
          ],
          expect: {
            statusIn: [200],
            bodyContains: ['full_name', 'owner', 'html_url'],
          },
        },
        dataFields: ['test_org', 'test_repo', 'userAgent'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tc_gh_03',
        projectId: ghProject.id,
        extId: 'GH-003',
        category: 'Rate Limiting & Concurrency',
        title: 'Load check: Validate fast concurrent burst against rate limit endpoint',
        priority: 'Medium',
        tags: ['load', 'concurrency'],
        type: 'load',
        spec: {
          request: {
            name: 'Concurrent Rate Limit Probe',
            method: 'GET',
            path: '/rate_limit',
            headers: {
              'User-Agent': '{{userAgent}}',
            },
          },
          totalRequests: 8,
          concurrency: 3,
          maxP95Ms: 2500,
        },
        dataFields: ['userAgent'],
        createdAt: new Date().toISOString(),
      },
    ];

    for (const tc of ghCases) {
      await setDoc(doc(db, 'test_cases', tc.id), tc);
    }

    // 2. Seed JSONPlaceholder REST Project
    const jpProject: Project = {
      id: 'proj_json_placeholder',
      ownerUserId: 'system_admin',
      name: 'JSONPlaceholder Live REST API',
      siteUrl: 'https://jsonplaceholder.typicode.com',
      description: 'Zero-config CRUD functional tests verifying JSON REST endpoints with parameter substitution.',
      dataset: {
        baseUrl: 'https://jsonplaceholder.typicode.com',
        sample_post_id: '1',
        sample_user_id: '1',
        new_post_title: 'Automated Test Verification Post',
        authTokens: {},
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'projects', jpProject.id), jpProject);

    await datasetService.createDataset({
      projectId: jpProject.id,
      name: 'JSONPlaceholder Sandbox Dataset',
      environment: 'sandbox',
      description: 'CRUD fixture values for post and comment endpoints',
      variables: jpProject.dataset,
      isDefault: true,
      ownerUserId: 'system_admin',
    });

    const jpCases: TestCase[] = [
      {
        id: 'tc_jp_01',
        projectId: jpProject.id,
        extId: 'JP-001',
        category: 'Posts CRUD',
        title: 'Fetch post by ID with dynamic parameter substitution: /posts/{{sample_post_id}}',
        priority: 'High',
        tags: ['crud', 'get', 'posts'],
        type: 'http',
        spec: {
          requests: [
            {
              name: 'Get Single Post',
              method: 'GET',
              path: '/posts/{{sample_post_id}}',
            },
          ],
          expect: {
            statusIn: [200],
            bodyContains: ['userId', 'id', 'title'],
          },
        },
        dataFields: ['sample_post_id'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tc_jp_02',
        projectId: jpProject.id,
        extId: 'JP-002',
        category: 'Posts CRUD',
        title: 'Create new resource via POST /posts with synthetic title',
        priority: 'High',
        tags: ['crud', 'post'],
        type: 'http',
        spec: {
          requests: [
            {
              name: 'Create Post Request',
              method: 'POST',
              path: '/posts',
              body: {
                title: '{{new_post_title}}',
                body: 'Generated by Verity Automated Suite Runner in Firestore',
                userId: 1,
              },
            },
          ],
          expect: {
            statusIn: [201, 200],
          },
        },
        dataFields: ['new_post_title'],
        createdAt: new Date().toISOString(),
      },
    ];

    for (const tc of jpCases) {
      await setDoc(doc(db, 'test_cases', tc.id), tc);
    }

    console.log('Firestore seed completed successfully.');
  } catch (err: any) {
    if (err?.message?.includes('Missing or insufficient permissions') || err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, 'projects');
    } else {
      console.warn('Firestore initialization notice:', err?.message || err);
    }
  }
}
