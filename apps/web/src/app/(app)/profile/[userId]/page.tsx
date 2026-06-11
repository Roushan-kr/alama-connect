"use client";

import ProfileView from "@/components/profile/ProfileView";
import { use } from "react";

interface PublicProfilePageProps {
  params: Promise<{ userId: string }>;
}

export default function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { userId } = use(params);
  return <ProfileView isSelf={false} userId={userId} />;
}
