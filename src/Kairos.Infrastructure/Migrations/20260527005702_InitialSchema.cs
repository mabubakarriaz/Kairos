using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kairos.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,");

            migrationBuilder.CreateTable(
                name: "oauth_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    access_token = table.Column<string>(type: "text", nullable: false),
                    refresh_token = table.Column<string>(type: "text", nullable: true),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    next_sync_token = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_oauth_tokens", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "tasks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    estimate_min = table.Column<int>(type: "integer", nullable: false, defaultValue: 30),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    tags = table.Column<List<string>>(type: "text[]", nullable: false, defaultValueSql: "'{}'"),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tasks", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "scheduled_blocks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    task_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    start_ts = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    end_ts = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    external_id = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    rrule = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scheduled_blocks", x => x.id);
                    table.CheckConstraint("ck_blocks_source", "source IN ('kairos','gcal')");
                    table.CheckConstraint("ck_blocks_time_order", "end_ts > start_ts");
                    table.ForeignKey(
                        name: "FK_scheduled_blocks_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_oauth_tokens_provider",
                table: "oauth_tokens",
                column: "provider",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_scheduled_blocks_task_id",
                table: "scheduled_blocks",
                column: "task_id");

            migrationBuilder.CreateIndex(
                name: "idx_blocks_external",
                table: "scheduled_blocks",
                columns: new[] { "source", "external_id" },
                filter: "external_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "idx_blocks_source",
                table: "scheduled_blocks",
                column: "source");

            // ── Range schema (not expressible in EF fluent mapping) ──────────────────────────
            // Stored generated `during` tstzrange derived from start_ts/end_ts. The free-slot SQL
            // and the no-overlap constraint operate on this column.
            migrationBuilder.Sql("""
                ALTER TABLE scheduled_blocks
                    ADD COLUMN during tstzrange
                    GENERATED ALWAYS AS (tstzrange(start_ts, end_ts, '[)')) STORED;
                """);

            // GiST index over `during` — makes the `&&` overlap probe (day window + free slots) fast.
            migrationBuilder.Sql(
                "CREATE INDEX idx_blocks_during_gist ON scheduled_blocks USING GIST (during);");

            // No two Kairos blocks may overlap. Gcal busy blocks (source='gcal') are exempt and may overlap.
            migrationBuilder.Sql("""
                ALTER TABLE scheduled_blocks
                    ADD CONSTRAINT no_overlap_kairos
                    EXCLUDE USING GIST (during WITH &&) WHERE (source = 'kairos');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "oauth_tokens");

            migrationBuilder.DropTable(
                name: "scheduled_blocks");

            migrationBuilder.DropTable(
                name: "tasks");
        }
    }
}
