import { CluesManager } from '@/components/clue-card/clues-manager';
import { clueService } from '@/lib/services/clue-service';
import './clues.css';

interface PageProps {
  params: Promise<{ scriptId: string }>;
}

export default async function CluesPage({ params }: PageProps) {
  const { scriptId } = await params;
  const [clues, actTabs] = await Promise.all([
    clueService.getClues(scriptId),
    clueService.getActTabs(scriptId),
  ]);

  return <CluesManager scriptId={scriptId} initialClues={clues} actTabs={actTabs} />;
}
