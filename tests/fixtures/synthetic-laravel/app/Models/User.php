<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Project;

/**
 * Class User
 * Handles system user management and authentications.
 */
class User extends Model
{
    protected $fillable = ['name', 'email', 'password', 'department_id'];

    /**
     * Get the projects created by this user.
     */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class, 'owner_id');
    }

    /**
     * Checks if the user has permission to manage department resources.
     */
    public function hasDepartmentPermission(int $deptId): bool
    {
        return $this->department_id === $deptId;
    }
}
