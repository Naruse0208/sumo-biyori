import RikishiProfile from "./rikishi-profile";

export default async function RikishiPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <RikishiProfile rikishiRef={ref} />;
}

