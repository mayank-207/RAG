<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\User;

/**
 * Class Project
 * Represents client projects in the CRM.
 */
class Project extends Model
{
    protected $fillable = ['title', 'description', 'owner_id', 'status', 'budget'];

    /**
     * Get the owner user of this project.
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * Converts a sales inquiry directly into an active project.
     */
    public function convertFromInquiry(int $inquiryId): void
    {
        $this->status = 'active';
        $this->save();
    }
}

