import React, { useState } from 'react';
import { Download, Copy, Check, Terminal, Cloud, Server, Shield, Sparkles, X, ChevronRight } from 'lucide-react';
import { Project } from '../types';

interface CloudDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onDownload: () => void;
}

export const CloudDeployModal: React.FC<CloudDeployModalProps> = ({
  isOpen,
  onClose,
  project,
  onDownload,
}) => {
  const [activeTab, setActiveTab] = useState<'docker' | 'gcp' | 'aws' | 'azure' | 'k8s' | 'terraform'>('docker');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !project) return null;

  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'verity-runner';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const SNIPPETS = {
    docker: `# 1. Extract the downloaded zip package
unzip ${slug}-test-runner.zip
cd ${slug}-cloud-runner

# 2. Build and launch with Docker Compose
docker compose up --build -d

# 3. Access standalone Web UI & runner at:
open http://localhost:4100`,

    gcp: `# 1. Build and push container to Google Artifact Registry
gcloud builds submit --tag gcr.io/\${GCP_PROJECT_ID}/${slug}-runner:latest .

# 2. Deploy to Google Cloud Run (Serverless)
gcloud run deploy ${slug}-runner \\
  --image gcr.io/\${GCP_PROJECT_ID}/${slug}-runner:latest \\
  --platform managed \\
  --region us-central1 \\
  --port 4100 \\
  --allow-unauthenticated`,

    aws: `# 1. Authenticate Docker with Amazon ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin \${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# 2. Build & Tag Container Image
docker build -t ${slug}-runner .
docker tag ${slug}-runner:latest \${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${slug}-runner:latest

# 3. Push and Launch on AWS App Runner or ECS Fargate (Port 4100)
docker push \${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${slug}-runner:latest`,

    azure: `# 1. Build image in Azure Container Registry
az acr build --registry \${MY_ACR_NAME} --image ${slug}-runner:latest .

# 2. Deploy to Azure Container Apps
az containerapp create \\
  --name ${slug}-runner \\
  --resource-group \${MY_RESOURCE_GROUP} \\
  --image \${MY_ACR_NAME}.azurecr.io/${slug}-runner:latest \\
  --target-port 4100 \\
  --ingress external`,

    k8s: `# Apply the included Kubernetes manifest
kubectl apply -f k8s/deployment.yaml

# Verify pod status
kubectl get pods -l app=${slug}-runner

# Forward port for immediate local verification
kubectl port-forward svc/${slug}-runner-svc 4100:4100`,

    terraform: `# Deploy infrastructure using the bundled Terraform module
cd terraform/
terraform init
terraform apply -auto-approve`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-[#1E2235] bg-[#0F111A] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#1E2235] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Multi-Cloud Standalone Package & Deployment</h3>
              <p className="text-xs text-slate-400">
                Self-hosted, zero-lock-in test runner for <span className="font-mono text-emerald-300">{project.siteUrl}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-[#131622] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Left Tabs */}
          <div className="w-full border-r border-[#1E2235] bg-[#06070B]/50 p-4 md:w-64">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Target Cloud Platform
            </div>
            <div className="mt-3 space-y-1.5">
              {[
                { id: 'docker', label: 'Docker / Compose', icon: Server },
                { id: 'gcp', label: 'Google Cloud Run', icon: Cloud },
                { id: 'aws', label: 'AWS ECS / Fargate', icon: Cloud },
                { id: 'azure', label: 'Azure Container Apps', icon: Cloud },
                { id: 'k8s', label: 'Kubernetes (K8s)', icon: Terminal },
                { id: 'terraform', label: 'Terraform IaC', icon: Sparkles },
              ].map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30 border border-emerald-500/30'
                        : 'text-slate-400 hover:bg-[#131622] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span>{tab.label}</span>
                    </div>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-emerald-400" />}
                  </button>
                );
              })}
            </div>

            {/* Quick Download Card */}
            <div className="mt-6 rounded-xl border border-[#1E2235] bg-[#131622] p-3">
              <div className="text-xs font-bold text-white">Full Runner Bundle</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Includes Dockerfile, standalone Express server, CLI runner, dataset, and k8s manifests.
              </p>
              <button
                onClick={onDownload}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download .ZIP</span>
              </button>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white capitalize">{activeTab} Deployment Instructions</h4>
                <p className="text-xs text-slate-400">Run the commands below inside the extracted package directory.</p>
              </div>
              <button
                onClick={() => copyToClipboard(SNIPPETS[activeTab], activeTab)}
                className="flex items-center gap-1.5 rounded-lg border border-[#1E2235] bg-[#131622] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-[#1A1D2B]"
              >
                {copiedKey === activeTab ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Commands</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[#1E2235] bg-[#06070B] p-4 font-mono text-xs text-emerald-300">
              <pre className="overflow-x-auto whitespace-pre-wrap">{SNIPPETS[activeTab]}</pre>
            </div>

            {/* Architecture Highlights */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#1E2235] bg-[#06070B]/60 p-4">
                <div className="text-xs font-bold text-white">100% Self-Contained Execution</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Runs directly inside your VPC or local network with zero external phone-home dependencies. You own 100% of the runtime.
                </p>
              </div>
              <div className="rounded-xl border border-[#1E2235] bg-[#06070B]/60 p-4">
                <div className="text-xs font-bold text-white">CI/CD Pipeline Friendly</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Execute headless automated checks in GitHub Actions, GitLab CI, or Jenkins using <code className="text-emerald-400 font-mono">./run-cli.sh</code> with native exit codes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
