import { SystemConfigPage } from "@/components/system-config-page";
import { getSystemConfigSnapshot } from "@/lib/services/system-config";

type SearchParams = {
  saved?: string;
};

export default async function SystemPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const initialConfig = await getSystemConfigSnapshot();

  return <SystemConfigPage initialConfig={initialConfig} saved={params.saved === "1"} />;
}
