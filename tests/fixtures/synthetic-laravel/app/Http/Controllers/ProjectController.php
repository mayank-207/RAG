<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProjectController
{
    /**
     * Display a listing of projects.
     */
    public function index(): JsonResponse
    {
        $projects = Project::with('owner')->get();
        return response()->json($projects);
    }

    /**
     * Store a newly created project in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'owner_id' => 'required|exists:users,id',
            'budget' => 'numeric|min:0',
        ]);

        $project = Project::create($validated);
        return response()->json($project, 201);
    }

    /**
     * Display the specified project.
     */
    public function show(int $id): JsonResponse
    {
        $project = Project::findOrFail($id);
        return response()->json($project);
    }
}

