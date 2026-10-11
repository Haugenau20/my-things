export function assertReviewedHostingDomain(projectId: string, authDomain: string): void {
  if (authDomain !== `${projectId}.firebaseapp.com` && authDomain !== 'things.muninn.quest') {
    throw new Error(
      'Production requires the project Firebase Hosting domain or things.muninn.quest.',
    );
  }
}
