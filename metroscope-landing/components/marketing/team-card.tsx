import Image from 'next/image';
import { Github, Linkedin } from 'lucide-react';

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  image?: string;
  linkedin?: string;
  github?: string;
}

export function TeamCard({ member }: { member: TeamMember }) {
  return (
    <article className="group relative flex h-full flex-col items-center overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 transition-all hover:-translate-y-1 hover:shadow-md sm:p-8">
      <div className="relative mb-6 h-32 w-32 shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-4 ring-neutral-50">
        {member.image ? (
          <Image
            src={member.image}
            alt={member.name}
            fill
            sizes="128px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-100 via-white to-rose-100" />
        )}
      </div>
      <div className="flex flex-1 flex-col text-center">
        <h3 className="font-serif text-2xl font-medium text-neutral-900">{member.name}</h3>
        <p className="text-maroon mt-2 text-xs font-semibold tracking-widest uppercase">
          {member.role}
        </p>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-neutral-600">
          {member.bio}
        </p>
        <div className="mt-6 flex items-center justify-center gap-4">
          {member.linkedin && (
            <a
              href={member.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-neutral-50 p-2 text-neutral-400 transition-colors hover:bg-[#0A66C2]/10 hover:text-[#0A66C2]"
            >
              <Linkedin className="h-5 w-5" />
              <span className="sr-only">LinkedIn</span>
            </a>
          )}
          {member.github && (
            <a
              href={member.github}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-neutral-50 p-2 text-neutral-400 transition-colors hover:bg-neutral-900/10 hover:text-neutral-900"
            >
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
