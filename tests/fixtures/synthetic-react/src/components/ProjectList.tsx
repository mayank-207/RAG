import React from 'react';
import { useProjects } from '../hooks/useProjects';
import { ProjectItem } from './ProjectItem';

export function ProjectList() {
  const { projects, loading } = useProjects();

  if (loading) return <div>Loading projects...</div>;

  return (
    <div className="project-list">
      <h2>Project Dashboard</h2>
      {projects.map((p) => (
        <ProjectItem key={p.id} id={p.id} title={p.title} status={p.status} />
      ))}
    </div>
  );
}

