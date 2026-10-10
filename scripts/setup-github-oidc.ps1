# One-time production IAM setup. Run only after the owner approves the scope in docs/GITHUB_ACTIONS.md.
$ErrorActionPreference = 'Stop'
function Invoke-DeploymentSetup([string[]]$Arguments) {
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Cloud deployment identity setup failed.' }
}
$deploymentProject = 'my-things-c7305'
$deploymentNumber = '388283732267'
$deploymentAccount = 'github-deploy@my-things-c7305.iam.gserviceaccount.com'
$deploymentPool = 'github-my-things'
Invoke-DeploymentSetup -Arguments @('services','enable','iam.googleapis.com','iamcredentials.googleapis.com','sts.googleapis.com','cloudresourcemanager.googleapis.com',"--project=$deploymentProject",'--quiet')
Invoke-DeploymentSetup -Arguments @('iam','service-accounts','create','github-deploy',"--project=$deploymentProject",'--display-name=GitHub main Firebase deploy','--quiet')
Invoke-DeploymentSetup -Arguments @('iam','workload-identity-pools','create',$deploymentPool,'--location=global',"--project=$deploymentProject",'--display-name=My things GitHub deploy','--quiet')
$deploymentMapping = 'google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref,attribute.event_name=assertion.event_name'
$deploymentCondition = "assertion.repository_id == '1413109191' && assertion.repository_owner_id == '106525925' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'Haugenau20/my-things/.github/workflows/ci.yml@refs/heads/main' && assertion.sub == 'repo:Haugenau20@106525925/my-things@1413109191:environment:production' && assertion.event_name in ['push', 'workflow_dispatch']"
Invoke-DeploymentSetup -Arguments @('iam','workload-identity-pools','providers','create-oidc','github',"--workload-identity-pool=$deploymentPool",'--location=global',"--project=$deploymentProject",'--issuer-uri=https://token.actions.githubusercontent.com',"--attribute-mapping=$deploymentMapping","--attribute-condition=$deploymentCondition",'--quiet')
$deploymentPrincipal = "principalSet://iam.googleapis.com/projects/$deploymentNumber/locations/global/workloadIdentityPools/$deploymentPool/attribute.repository_id/1413109191"
Invoke-DeploymentSetup -Arguments @('iam','service-accounts','add-iam-policy-binding',$deploymentAccount,"--project=$deploymentProject","--member=$deploymentPrincipal",'--role=roles/iam.workloadIdentityUser','--quiet')
foreach ($deploymentRole in @('roles/firebasehosting.admin','roles/firebaserules.admin','roles/firebasestorage.viewer','roles/datastore.indexAdmin','roles/serviceusage.serviceUsageConsumer')) {
  Invoke-DeploymentSetup -Arguments @('projects','add-iam-policy-binding',$deploymentProject,"--member=serviceAccount:$deploymentAccount","--role=$deploymentRole",'--condition=None','--quiet','--format=none')
}
