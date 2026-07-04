import { BoatSimulator } from "@/components/sim/BoatSimulator";

type HomePageProps = {
  searchParams: Promise<{
    boat?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const params = await searchParams;

  return <BoatSimulator initialBoatSlug={params.boat} />;
}
